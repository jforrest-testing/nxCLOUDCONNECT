var express    = require('express');
var auth       = require('http-auth');
var http       = require('http');
var bodyParser = require('body-parser');
var jade       = require('jade');
var sqlite3    = require('sqlite3');

var db;

function initDB() {
  db = new sqlite3.Database('readings.sqlite3', createTable);
}

function createTable() {
  db.run("CREATE TABLE IF NOT EXISTS readings (timestamp DATETIME, name STRING, latitude REAL, longitude REAL)");
}

initDB();

var delivery_app    = express();
var delivery_router = express.Router();
var delivery_port   = 8080;
var basic = auth.basic({
  file:  __dirname + "/htpasswd"
});

delivery_app.use(bodyParser.json());
delivery_app.use(auth.connect(basic));

delivery_router.route('/delivery/system_status').get(
  function(req,res) {
    console.log("System status check");
    var body = 'true';
    res.send(body);
  }
);

delivery_router.route('/delivery/message').post(
  function(req, res) {
    //console.log('\r\nMessage = ' + JSON.stringify(req.body));

    var etype = req.body.data.event_type;
    var ts  = new Date(Date.parse(req.body.data.event_timestamp));
    var dev = req.body.data.device_name;
    var lat = req.body.data.gps_latitude;
    var lng = req.body.data.gps_longitude;

    ts = ts.toISOString().replace(/T/,' ').replace(/\..+/,'');

    console.log("Event Type:  " + etype);
    console.log(" Timestamp:  " + ts);

    if (!lat || !lng) {
      console.log("No GPS information, skipping");
      var body = 'OK';
      res.send(body);
      return;
    }

    var sql = "INSERT INTO readings VALUES ('" + ts + "','" + dev + "'," + lat + "," + lng + ")";

    console.log(sql);

    var s = db.prepare(sql);
    s.run(function() {
      console.log("Reading inserted");
      var body = 'OK';
      res.send(body);
    });

  }
);

var map_app      = express();
var map_router   = express.Router();
var map_port     = 80;

map_app.use(bodyParser.json());

map_app.set('views', './views');
map_app.set('view engine', 'jade');
map_router.route('/map').get(
  function(req,res) {
    // Get last reading insert
    db.each("SELECT * FROM readings ORDER BY timestamp DESC LIMIT 1",
            function(err, row) {
              device    = row.name;
              timestamp = row.timestamp;
              latitude  = row.latitude;
              longitude = row.longitude;
              res.render('map');
            });
    }
);

delivery_app.use('/nxCLOUDCONNECT/', delivery_router);
delivery_app.listen(delivery_port);

map_app.use('/', map_router);
map_app.listen(map_port);
