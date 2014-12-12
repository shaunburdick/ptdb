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
      expect(mydb.dbHash).not.toBeNull();
      expect(mydb.db).not.toBeNull();
      mydb.write('foo', 'bar', function(err) {
        mydb.close(function() {
          expect(fs.existsSync(mydb.filename)).toBeTruthy();
          done();
        });
      });
    });
  });

  it ('should close a db', function(done) {
    var mydb = new PTDB(testDir + '/testDb');
    mydb.load(function() {
      mydb.close(function() {
        expect(mydb.db).toBeFalsy();
        expect(mydb.syncInterval).toBeFalsy();
        done();
      });
    });
  });

  it ('should write db to file', function(done) {
    var mydb = new PTDB(testDir + '/testDb');
    mydb.load(function() {
      mydb.write('foo', 'bar', function(err) {
        expect(err).toBeFalsy();
        mydb.save(function(err) {
          expect(err).toBeFalsy();
          var serialized = mydb.serialize();
          expect(serialized.length).toBeGreaterThan(0);
          fs.readFile(mydb.filename, function(err, contents) {
            expect(err).toBeFalsy();
            expect(contents.toString()).toEqual(serialized);
            // return lock
            mydb.close(function() {
              var samedb = new PTDB(testDir + '/testDb');
              samedb.load(function() {
                expect(samedb.dbHash).not.toBeNull();
                expect(samedb.db).not.toBeNull();
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

  describe('Writing', function() {
    var mydb;
    beforeEach(function() {
      mydb = new PTDB(testDir + '/testDb');
    });

    it ('should write a simple key', function(done) {
      mydb.load(function() {
        mydb.write('foo', 'bar', function(err) {
          expect(err).toBeFalsy();
          // return lock
          mydb.close(function() {
            done();
          });
        });
      });
    });

    it ('should write a complex key', function(done) {
      mydb.load(function() {
        mydb.write('fe.fi.fo.fum', 'bar', function(err) {
          expect(err).toBeFalsy();
          // return lock
          mydb.close(function() {
            done();
          });
        });
      });
    });

    it ('should delete an item', function(done) {
      mydb.load(function() {
        mydb.write('foo', 'bar', function(err) {
          expect(err).toBeFalsy();
          mydb.unset('foo', function(err) {
            expect(err).toBeFalsy();
            mydb.read('foo', function(err, item) {
              expect(err).toBeFalsy();
              expect(item).not.toEqual('bar');
              // return lock
              mydb.close(function() {
                done();
              });
            });
          });
        });
      });
    });

    it ('should delete everything', function(done) {
      mydb.load(function() {
        mydb.write('foo', 'bar', function(err) {
          expect(err).toBeFalsy();
          mydb.unset('.', function(err) {
            expect(err).toBeFalsy();
            expect(mydb.db.records).toEqual({});
            // return lock
            mydb.close(function() {
              done();
            });
          });
        });
      });
    });

    it ('should push an item onto an array', function(done) {
      mydb.load(function() {
        mydb.write('foo', [], function(err) {
          expect(err).toBeFalsy();
          mydb.push('foo', 'bar', function(err) {
            expect(err).toBeFalsy();
            // return lock
            mydb.close(function() {
              done();
            });
          });
        });
      });
    });

    it ('should unshift an item onto an array', function(done) {
      mydb.load(function() {
        mydb.write('foo', [], function(err) {
          expect(err).toBeFalsy();
          mydb.unshift('foo', 'bar', function(err) {
            expect(err).toBeFalsy();
            // return lock
            mydb.close(function() {
              done();
            });
          });
        });
      });
    });
  });

  describe('Reading', function() {
    var mydb;
    beforeEach(function() {
      mydb = new PTDB(testDir + '/testDb');
    });

    it ('should read from head', function(done) {
      mydb.load(function() {
        mydb.write('foo', 'bar', function(err) {
          expect(err).toBeFalsy();
          mydb.read('.', function(err, item) {
            expect(err).toBeFalsy();
            expect(item).toEqual({foo: 'bar'});
            // return lock
            mydb.close(function() {
              done();
            });
          });
        });
      });
    });

    it ('should read a simple key', function(done) {
      mydb.load(function() {
        mydb.write('foo', 'bar', function(err) {
          expect(err).toBeFalsy();
          mydb.read('foo', function(err, item) {
            expect(err).toBeFalsy();
            expect(item).toEqual('bar');
            // return lock
            mydb.close(function() {
              done();
            });
          });
        });
      });
    });

    it ('should read a complex key', function(done) {
      mydb.load(function() {
        mydb.write('fe.fi.fo.fum', 'bar', function(err) {
          expect(err).toBeFalsy();
          mydb.read('fe.fi.fo.fum', function(err, item) {
            expect(err).toBeFalsy();
            expect(item).toEqual('bar');
            // return lock
            mydb.close(function() {
              done();
            });
          });
        });
      });
    });

    it ('should pop an item off an array', function(done) {
      mydb.load(function() {
        mydb.write('foo', ['fizz', 'buzz'], function(err) {
          expect(err).toBeFalsy();
          mydb.read('foo', function(err, item) {
            expect(err).toBeFalsy();
            expect(item).toEqual(['fizz', 'buzz']);
            mydb.pop('foo', function(err, item) {
              expect(err).toBeFalsy();
              expect(item).toEqual('buzz');
              mydb.read('foo', function(err, item) {
                expect(err).toBeFalsy();
                expect(item).toEqual(['fizz']);
                // return lock
                mydb.close(function() {
                  done();
                });
              });
            })
          });
        });
      });
    });

    it ('should shift an item off an array', function(done) {
      mydb.load(function() {
        mydb.write('foo', ['fizz', 'buzz'], function(err) {
          expect(err).toBeFalsy();
          mydb.read('foo', function(err, item) {
            expect(err).toBeFalsy();
            expect(item).toEqual(['fizz', 'buzz']);
            mydb.shift('foo', function(err, item) {
              expect(err).toBeFalsy();
              expect(item).toEqual('fizz');
              mydb.read('foo', function(err, item) {
                expect(err).toBeFalsy();
                expect(item).toEqual(['buzz']);
                // return lock
                mydb.close(function() {
                  done();
                });
              });
            })
          });
        });
      });
    });
  });

  describe('Events', function() {
    var mydb;
    beforeEach(function() {
      mydb = new PTDB(testDir + '/testDb', {syncInterval: 1000});
    });

    it ('should trigger the load event', function(done) {
      var loaded = false;
      mydb.on(mydb.events.load, function() {
        loaded = true;
      });
      mydb.load(function() {
        // return lock
        mydb.close(function() {
          done();
        });
      });

      waitsFor(function() { return loaded; }, 'Load event triggered', 1000);
    });


    it ('should trigger the save event', function(done) {
      var saved = false;
      mydb.on(mydb.events.save, function() {
        saved = true;
      });
      mydb.load(function() {
        mydb.write('foo', 'bar', function(err) {
          expect(err).toBeFalsy();
          // return lock
          mydb.close(function() {
            done();
          });
        });
      });

      waitsFor(function() { return saved; }, 'Save event triggered', 1000);
    });

    it ('should trigger save event once', function(done) {
      var saved = 0, closed = false;

      mydb.on(mydb.events.save, function() {
        saved++;
      });
      mydb.load(function() {
        mydb.write('foo', 'bar', function(err) {
          expect(err).toBeFalsy();
          // return lock
          mydb.close(function() {
            closed = true;
            done();
          });
        });
      });

      waitsFor(function() { return closed && saved === 1; }, 'Close event triggered', 1000);
    });

    it ('should trigger the close event', function(done) {
      var closed = false;
      mydb.on(mydb.events.close, function() {
        closed = true;
      });
      mydb.load(function() {
        // return lock
        mydb.close(function() {
          done();
        });
      });

      waitsFor(function() { return closed; }, 'Close event triggered', 1000);
    });
  });
});