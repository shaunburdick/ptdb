var VError = require('verror')
  fs = require('fs'),
  util = require('util'),
  crypto = require('crypto'),
  EventEmitter = require('events').EventEmitter,
  ext = '.ptsb';

/** Keep a table of locks to prevent the db from being opened more than once */
var lockTable = {};

/**
 * Create new PTDB.
 * @param string path   the path to the db
 * @param object config config settings for db
 */
function PTDB(path, config) {
  this.events = {
    load: 'load',
    close: 'close',
    save: 'save'
  }

  this.config = config || {};
  this.path = path; // path to db file
  this.filename = path + ext;
  this.db = null; // The in-memory instance of the db
  this.syncInterval = null; // The interval object
  this.dbHash = null; // used to check for changes
}

util.inherits(PTDB, EventEmitter);

PTDB.prototype.defaults = {
  syncInterval: 60000
};

/**
 * Loads the db
 * @param function callback The callback gets no params
 */
PTDB.prototype.load = function(callback) {
  if (lockTable.hasOwnProperty(this.filename)) {
    throw new VError('DB is already open: %s', this.filename);
  }

  lockTable[this.filename] = true;
  var $this = this;

  fs.readFile(this.filename, function(err, buffer) {
    // Don't care if error, we will try to write to it later

    var fileContents = buffer ? buffer.toString() : null;
    if (typeof fileContents === 'string' && fileContents.length) {
      try {
        $this.db = $this.unserialize(fileContents);
      } catch (e) {
        throw new VError(e, 'Your db appears to have corrupted');
      }
    } else {
      $this.db = {
        records: {},
        info: {
          created: Date.now(),
          modified: Date.now()
        }
      };
    }

    $this.dbHash = $this.hashDB();
    $this.loaded = true;

    $this.startSync();
    $this.emit($this.events.load);
    if (typeof callback === 'function') {
      callback.apply($this);
    }
  });
};

/**
 * Start the sync interval.
 */
PTDB.prototype.startSync = function() {
  var $this = this;
  this.save(function(err) {
    if (err) {
      throw err;
    }
    this.syncInterval = setInterval(function() {
      $this.save();
    }, this.config.syncInterval || this.defaults.syncInterval);
  });
};

/**
 * Stop sync interval.
 */
PTDB.prototype.stopSync = function() {
  if (this.syncInterval) {
    clearInterval(this.syncInterval);
    this.syncInterval = null;
  }
};

/**
 * Save the db to disk
 * @param function callback Callback gets argument of error
 */
PTDB.prototype.save = function(callback) {
  if (!this.db) {
    var err = new VError('DB has not been loaded');
    if (typeof callback === 'function') {
      callback(err); return;
    } else {
      throw err;
    }
  }

  if (this.dbHash !== this.hashDB()) {
    this.db.info.modified = Date.now();
    this.dbHash = this.hashDB();

    var serialized = this.serialize(),
      $this = this;
    fs.writeFile(this.filename, serialized, function(err) {
      if (err) {
        var verr = new VError(err, 'Could not open %s for writing', $this.filename);
        if (typeof callback === 'function') {
          callback(verr); return;
        } else {
          throw verr;
        }
      }

      $this.emit($this.events.save);
      if (typeof callback === 'function') {
        callback.apply($this);
      }
    });
  } else {
    // Call the callback
    if (typeof callback === 'function') {
      callback.apply(this);
    }
  }
};

/**
 * Close the db.
 * @param function callback Callback
 */
PTDB.prototype.close = function(callback) {
  this.save(function(err) {
    if (err) {
      throw err;
    }

    this.db = null;
    this.dbHash = null;
    this.stopSync();
    this.closed = true;
    delete lockTable[this.filename];

    this.emit(this.events.close);
    if (typeof callback === 'function') {
      callback();
    }
  });
};

/**
 * Converts db to saveable string
 */
PTDB.prototype.serialize = function() {
  return JSON.stringify(this.db);
};

/**
 * Converts db string to object
 */
PTDB.prototype.unserialize = function(serialized) {
  return JSON.parse(serialized);
};

/**
 * Return a hash of the data.
 * @return string
 */
PTDB.prototype.hashDB = function() {
  // Update the hash.
  var hasher = crypto.createHash('md5').update(this.serialize());
  return hasher.digest('hex');
}

/**
 * Parse a path and walk the db.
 * @param string path
 * @return item
 */
PTDB.prototype.dbWalk = function(path, value) {
  var splody = this.parsePath(path),
    item = this.db.records,
    value = value || {};

  if (splody === '.') {
    return item;
  }

  for (var i = 0; i < splody.length - 1; i++) {
    if (!item.hasOwnProperty(splody[i])) {
      item[splody[i]] = {}; // create it!
    } else if (i < splody.length - 1 && typeof item[splody[i]] !== 'object') {
      throw new VError('%s of %s is not an object, cannot go further', splody[i], path);
    }

    item = item[splody[i]];
  }

  if (!item.hasOwnProperty(splody[i])) {
    item[splody[i]] = value;
  }

  return item[splody[i]];
};

/**
 * Parses a path into an array of successive items.
 * @param string path The path to parse
 * @return array ['item1', 'item2', ...]
 */
PTDB.prototype.parsePath = function(path) {
  return path === '.' ? path : path.split('.');
};

/**
 * Read an item from the db.
 * @param string   path     The structure path
 * @param function callback The callback will get err, item
 */
PTDB.prototype.read = function(path, callback) {
  try {
    var item = this.dbWalk(path);
    if (typeof callback === 'function') {
      callback(null, item);
    } else {
      return item;
    }
  } catch (e) {
    if (typeof callback === 'function') {
      callback(e);
    } else {
      throw e;
    }
  }
};

/**
 * Pop an item from an array in the db.
 * @param string   path     The structure path
 * @param function callback The callback will get err, item
 */
PTDB.prototype.pop = function(path, callback) {
  try {
    var item = this.dbWalk(path);

    if (!util.isArray(item)) {
      throw new VError('%s is not an array', path);
    }

    var val = item.pop();
    this.save(function(err) {
      if (err) {
        throw err;
      }
      if (typeof callback === 'function') {
        callback(null, val);
      }
    });
  } catch (e) {
    if (typeof callback === 'function') {
      callback(e);
    } else {
      throw e;
    }
  }
};

/**
 * Shift an item from an array in the db.
 * @param string   path     The structure path
 * @param function callback The callback will get err, item
 */
PTDB.prototype.shift = function(path, callback) {
  try {
    var item = this.dbWalk(path);

    if (!util.isArray(item)) {
      throw new VError('%s is not an array', path);
    }

    var val = item.shift();
    this.save(function(err) {
      if (err) {
        throw err;
      }
      if (typeof callback === 'function') {
        callback(null, val);
      }
    });
  } catch (e) {
    if (typeof callback === 'function') {
      callback(e);
    } else {
      throw e;
    }
  }
};

/**
 * Write an item to the db.
 * @param string   path     The structure path
 * @param mixed    value    The data to store in the path
 * @param function callback The callback will get err, item
 */
PTDB.prototype.write = function(path, value, callback) {
  try {
    var item = this.dbWalk(path, value);
    this.save(function(err) {
      if (err) {
        throw err;
      }

      if (typeof callback === 'function') {
        callback(null, item);
      } else {
        return item;
      }
    });
  } catch (e) {
    if (typeof callback === 'function') {
      callback(e);
    } else {
      throw e;
    }
  }
};

/**
 * Push an item onto an array in the db.
 * @param string   path     The structure path
 * @param mixed    value    The data to store in the path
 * @param function callback The callback will get err, item
 */
PTDB.prototype.push = function(path, value, callback) {
  try {
    var item = this.dbWalk(path, []);
    if (!util.isArray(item)) {
      throw new VError('%s is not an array', path);
    }

    item.push(value);

    this.save(function(err) {
      if (err) {
        throw err;
      }

      if (typeof callback === 'function') {
        callback(null, item);
      } else {
        return item;
      }
    });
  } catch (e) {
    if (typeof callback === 'function') {
      callback(e);
    } else {
      throw e;
    }
  }
};

/**
 * Unshift an item onto an array in the db.
 * @param string   path     The structure path
 * @param mixed    value    The data to store in the path
 * @param function callback The callback will get err, item
 */
PTDB.prototype.unshift = function(path, value, callback) {
  try {
    var item = this.dbWalk(path, []);
    if (!util.isArray(item)) {
      throw new VError('%s is not an array', path);
    }

    item.unshift(value);

    this.save(function(err) {
      if (err) {
        throw err;
      }

      if (typeof callback === 'function') {
        callback(null, item);
      } else {
        return item;
      }
    });
  } catch (e) {
    if (typeof callback === 'function') {
      callback(e);
    } else {
      throw e;
    }
  }
};

/**
 * Unshift an item onto an array in the db.
 * @param string   path     The structure path
 * @param function callback The callback will get err
 */
PTDB.prototype.unset = function(path, callback) {
  var splody = this.parsePath(path),
    item = this.db.records;

  try {
    if (splody === '.') {
      this.db.records = {};
      this.save(function(err) {
        if (err) {
          throw err;
        }
        if (typeof callback === 'function') {
          callback();
        }
      });
    } else {
      for (var i = 0; i < splody.length - 1; i++) {
        if (!item.hasOwnProperty(splody[i])) {
          // It doesn't exist, so it's deleted
          i = splody.length;
        } else if (i < splody.length - 1 && typeof item[splody[i]] !== 'object') {
          throw new VError('%s of %s is not an object, cannot go further', splody[i], path);
        } else {
          item = item[splody[i]];
        }
      }

      if (item.hasOwnProperty(splody[i])) {
        delete item[splody[i]];
      }

      this.save(function(err) {
        if (err) {
          throw err;
        }
        if (typeof callback === 'function') {
          callback();
        }
      });
    }
  } catch (e) {
    if (typeof callback === 'function') {
      callback(e);
    } else {
      throw e;
    }
  }
};

module.exports = PTDB;