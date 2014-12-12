var PTDB = require('../ptdb'),
  fs = require('fs'),
  rimraf = require('rimraf'),
  testDir = 'test';

describe('PTDB', function() {
  beforeEach(function() {
    if (fs.existsSync(testDir)) {
      rimraf.sync(testDir);
    }
    fs.mkdirSync(testDir);
  });

  afterEach(function() {
    rimraf.sync(testDir);
  });

  it ('should create a new db', function(done) {
    var mydb = new PTDB(testDir + '/testDb');
    mydb.load(function() {
      mydb.close(function() {
        expect(fs.existsSync(mydb.filename)).toBeTruthy();
        done();
      });
    });
  });

  it ('should read an existing db', function(done) {
    var mydb = new PTDB(testDir + '/testDb');
    mydb.load(function() {
      mydb.write('foo', 'bar', function(err) {
        expect(err).toBeFalsy();
        // return lock
        mydb.close(function() {
          var samedb = new PTDB(testDir + '/testDb');
          samedb.load(function() {
            samedb.read('foo', function(err, item) {
              expect(err).toBeFalsy();
              expect(item).toEqual('bar');
              samedb.close(function() {
                done();
              });
            });
          });
        });
      });
    });
  });
});