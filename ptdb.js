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
  this.watchers = {}; // A table of paths and their watchers
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
    $this.on($this.events.save, function() {
      $this.triggerWatchers();
    });
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
 * @param mixed serializeMe If empty it will use this.db
 */
PTDB.prototype.serialize = function(serializeMe) {
  serializeMe = serializeMe || this.db;
  return JSON.stringify(serializeMe);
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
  return this.hash(this.serialize());
}

/**
 * Return a hash of the data.
 * @param string hashMe
 * @return string
 */
PTDB.prototype.hash = function(hashMe) {
  var hasher = crypto.createHash('md5').update(hashMe);
  return hasher.digest('hex');
}

/**
 * Parse a path and walk the db.
 * @param string  path
 * @param mixed   value
 * @param boolean noCreate If true, it will not create path
 * @return item
 */
PTDB.prototype.dbWalk = function(path, value, noCreate) {
  var splody = this.parsePath(path),
    item = this.db.records;

  if (splody === '.') {
    return item;
  }

  for (var i = 0; i < splody.length - 1; i++) {
    if (!noCreate && !item.hasOwnProperty(splody[i])) {
      item[splody[i]] = {}; // create it!
    } else if (i < splody.length - 1 && typeof item[splody[i]] !== 'object') {
      throw new VError('%s of %s is not an object, cannot go further', splody[i], path);
    }

    item = item[splody[i]];
  }

  if (value || !item.hasOwnProperty(splody[i])) {
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

/**
 * Watch a path and execute a function when it changes.
 * @param string   path
 * @param function callback Gets data, path as arguments
 */
PTDB.prototype.watch = function(path, callback) {
  if (!this.watchers.hasOwnProperty(path)) {
    this.watchers[path] = {
      callbacks: [],
      lastHash: null,
      prevVal: null
    };
  }

  this.watchers[path].callbacks.push(callback);
};

/**
 * Unset any watchers for a path.
 * @param string path
 */
PTDB.prototype.unwatch = function(path) {
  if (this.watchers.hasOwnProperty(path)) {
    delete this.watchers[path];
  }
};

/**
 * Check for changes and trigger watchers.
 */
PTDB.prototype.triggerWatchers = function() {
  for (var i in this.watchers) {
    if (this.watchers.hasOwnProperty(i)) {
      $this = this;
      (function() {
        var path = i;
        $this.read(path, function(err, item) {
          if (err) {
            throw err;
          }

          var newHash = $this.hash($this.serialize(item));
          var prevVal = $this.watchers[path].prevVal;
          if ($this.watchers[path].lastHash !== newHash) {
            $this.watchers[path].lastHash = newHash;
            $this.watchers[path].prevVal = item;
            // Time to call watchers
            $this.watchers[path].callbacks.forEach(function(callback) {
              process.nextTick(function() {
                callback.apply($this, [item, prevVal, path]);
              });
            });
          }
        });
      }());
    }
  }
};

module.exports = PTDB;