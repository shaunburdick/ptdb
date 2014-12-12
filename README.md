Plain Text DB
=============

This is a lame little plugin that allows you to use a javascript object as a database.  You can save/load objects to file.

***Saving is not guaranteed***

This is not meant to be a high-write db, this is meant to be something you can use when your app doesn't need an actual db.

## Install PTDB

```
npm install ptdb
```

## Usage

You must require the PTDB object
```
var PTDB = require('ptdb');
```

### Loading
To load/create a new DB, simply create a new instance and give it a name.

You can specify the following config options:
* **syncInterval**: the number of milleseconds between syncs to disk

```
var mydb = new PTDB('mydb'); // creates/loads a new mydb.ptdb in local path
mydb.load(function() {
  // DB has loaded, do some stuff
});

var anotherdb = new PTDB('db/anotherdb', {syncInterval: 1000});  // creates/loads from db/anotherdb.ptdb, and sets the write interval to 1s
```

### Reading
To read an item from the db:

```
mydb.load(function() {
  // Read an item from the db
  mydb.read('path.to.item', function(err, item) {
    if (!err) console.log(item);
  });

  // Read from the top/head (.)
  mydb.read('.', function(err, item) {
    if (!err) console.log(item);
  });

  // pop an item off an array in the db
  mydb.pop('path.to.array', function(err, item) {
    if (!err) console.log(item);
  });

  // shift an item off an array in the db
  mydb.shift('path.to.array', function(err, item) {
    if (!err) console.log(item);
  });
});
```

### Writing
You have a few options for writing, based on the type of item you are writing too.  If the item or path doesn't exist, it will create it.

```
mydb.load(function() {
  mydb.write('path.to.item', item, function(err) {
    if (!err) console.log('Item written');
  });

  mydb.push('path.to.array', item, function(err) {
    if (!err) console.log('Item pushed to array');
  });

  mydb.unshift('path.to.array', item, function(err) {
    if (!err) console.log('Item unshifted to array');
  });
});
```

### Deleting
You can delete items from the db as well.

```
mydb.unset('path.to.item', function(err) {
  if (!err) console.log('Item deleted');
});

// You can truncate the whole db by unsetting head (.)
mydb.unset('.', function(err) {
  if (!err) console.log('Item deleted');
});
```

### Closing
You can close your db when you are done with it:
This will break the lock and free the memory.

```
mydb.close();
```

You can always reopen the db by loading again!

### Events
PTDB has the following events:
* **load**: This is emitted when the db is loaded
* **save**: This is emitted when the db is saved
* **close**: This is emitted when the db is closed

## Testing
Run tests via

```
npm run test
```