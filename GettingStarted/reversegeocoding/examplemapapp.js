var express    = require('express');
var auth       = require('http-auth');
var http       = require('http');
var bodyParser = require('body-parser');
var jade       = require('jade');
var sqlite3    = require('sqlite3');
var unirest    = require('unirest');
var fs         = require('fs');

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

delivery_router.route('/system_status').get(
  function(req,res) {
    console.log("System status check");
    var body = 'true';
    res.send(body);
  }
);

delivery_router.route('/message').post(
  function(req, res) {

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

map_router.route('/reversegeocode').get(
  function(req,res) {

    var credentials = new Buffer(fs.readFileSync(__dirname + "/apicredentials").toString().trim());
    credentials = credentials.toString("base64");

    var device    = req.query.device;
    var latitude  = req.query.latitude;
    var longitude = req.query.longitude;

    var georeq = unirest("POST", "https://api-staging.services.numerex.com/telematics/reverse_geocode");

    georeq.headers({
      "content-type": "application/json",
      "authorization": "Basic " + credentials
    });
    georeq.type("json");
    georeq.send({
      "device_name_type": "imei",
      "device_name": device,
      "latitude": latitude,
      "longitude": longitude
   });

   georeq.end(function (geores) {
      if (geores.error) throw new Error(geores.error);
      var address = geores.body.addr_line_1 + "\n" + geores.body.addr_line_2;
      res.send(address);
   });

  }
);

delivery_app.use('/nxCLOUDCONNECT/delivery', delivery_router);
delivery_app.listen(delivery_port);

map_app.use('/', map_router);
map_app.listen(map_port);
