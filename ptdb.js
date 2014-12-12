var VError = require('verror')
  fs = require('fs'),
  util = require('util'),
  ext = '.ptsb';

/** Keep a table of locks to prevent the db from being opened more than once */
var lockTable = {};

/**
 * Create new PTDB.
 * @param string path   the path to the db
 * @param object config config settings for db
 */
function PTDB(path, config) {
  this.config = config || {};
  this.path = path; // path to db file
  this.filename = path + ext;
  this.db = null; // The in-memory instance of the db
  this.syncInterval = null; // The interval object
}

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
      $this.db = {};
    }

    $this.startSync();
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
  this.save(function() {
    this.syncInterval = setInterval(function() {
      $this.save();
    }, this.config.syncInterval || 60000);
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
}

/**
 * Save the db to disk
 * @param function callback Callback
 */
PTDB.prototype.save = function(callback) {
  if (!this.db) {
    throw new VError('DB has not been loaded');
  }

  var serialized = this.serialize(),
    $this = this;
  fs.writeFile(this.filename, serialized, function(err) {
    if (err) {
      throw new VError(err, 'Could not open %s for writing', $this.filename);
    }

    if (typeof callback === 'function') {
      callback.apply($this);
    }
  });
};

/**
 * Close the db.
 * @param function callback Callback
 */
PTDB.prototype.close = function(callback) {
  this.save(function() {
    this.stopSync();
    delete lockTable[this.filename];
    this.db = null;

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
 * Parse a path and walk the db.
 * @param string path
 * @return item
 */
PTDB.prototype.dbWalk = function(path, value) {
  var splody = path.split('.'),
    item = this.db,
    value = value || {};

  for (var i = 0; i < splody.length - 1; i++) {
    if (!item.hasOwnProperty(splody[i])) {
      item[splody[i]] = {}; // create it!
    } else if (i < splody.length - 1 && typeof item[splody[i] !== 'object']) {
      throw new VError('%s of %s is not an object, cannot go further', splody[i], path);
    }

    item = item[splody[i]];
  }

  if (!item.hasOwnProperty(splody[i])) {
    item[splody[i]] = value;
  }

  return item[splody[i]];
}

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
 * Write an item to the db.
 * @param string   path     The structure path
 * @param mixed    value    The data to store in the path
 * @param function callback The callback will get err, item
 */
PTDB.prototype.write = function(path, value, callback) {
  try {
    var item = this.dbWalk(path, value);
    this.save(function() {
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

    this.save(function() {
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

    this.save(function() {
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

module.exports = PTDB;