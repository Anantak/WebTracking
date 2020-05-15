var COLORS = ['red', 'green', 'lightblue', 'magenta', 'grey', 'blue'];

// Returns the origin of given frame as a LatLng.
function frameOriginLL(frame) {
  return new google.maps.LatLng(frame['origin']['lat'], frame['origin']['lng']);
}

class LocationData extends Polymer.MutableData(Polymer.Element) {
  static get is() { return 'location-data'; }

  static get properties() {
    return {
      deploymentId : String,
      deploymentLocationId: {
        type: String,
        observer: '_deploymentLocationChanged'
      },
      anantakBucket: String,

      locData: {
        type: Object,
        notify: true
      }
    };
  }

  constructor()
  {
    console.log('LocationData: LOCDATA CTOR');
    super();
    this.locData = {
      locationFrames: {},
      routesData: {},  // location-id -> route-id -> {route+stops+color}
      obstacleMaps: {},
      overlays: {},
    };
  }

  // When deployment location setting is changed this downloads the new data.
  _deploymentLocationChanged(newLocation, oldLocation)
  {
    if (!newLocation) return;
    if (newLocation == '') return;

    console.log('LocationData: Deployment location changed to: ', newLocation, ', from: ', oldLocation);

    var framesObjName = this._configFileObjectPath(newLocation, '.frames.json');
    var routesObjName = this._configFileObjectPath(newLocation, '.routes.json');
    var stopsObjName = this._configFileObjectPath(newLocation, '.stops.json');
    var routeMarkersObjName = this._configFileObjectPath(newLocation, '.route_markers.json');
    var obstableMapsObjName = this._configFileObjectPath(newLocation, '.obstaclemaps.json');
    var overlaysObjName = this._configFileObjectPath(newLocation, '.overlays.json');
    var datastoresObjName = this._configFileObjectPath(newLocation, '.datastores.json');
    fetchGcsObjects(this.anantakBucket,
                    [framesObjName, routesObjName, stopsObjName, routeMarkersObjName,
                     obstableMapsObjName, overlaysObjName, datastoresObjName],
      function(responses) {
        var frames = JSON.parse(responses[framesObjName]);
        var routes = JSON.parse(responses[routesObjName]);
        var stops = JSON.parse(responses[stopsObjName]);
        var routeMarkers = JSON.parse(responses[routeMarkersObjName]);
        var datastores = JSON.parse(responses[datastoresObjName]);
        this.locData.obstacleMaps = JSON.parse(responses[obstableMapsObjName]);
        this.locData.overlays = JSON.parse(responses[overlaysObjName]);
        this.locData.anantakBucket = this.anantakBucket;
        // this.locData.mapOverlaysFile = 'deployment-' + this.deploymentId + '/maps/routes_markers.json';
        // // Adjust the overlays filepaths from relative to absolute.
        // for (var i in this.locData.overlays) {
        //   this.locData.overlays[i].image = filepath(this.anantakBucket, this._configFileObjectPath(
        //       newLocation, this.locData.overlays[i].image));
        //   console.log('LocationData: this.locData.overlays[i].image: ', i,' ', this.locData.overlays[i].image);
        // }
        // this._updateLocationFrames(newLocation, frames);
        // this._updateRoutesAndStops(newLocation, routes, stops, routeMarkers);
        this._updateDatastores(newLocation, datastores);
        this.dispatchEvent(new CustomEvent('data-updated', {
          detail: {'newloc': newLocation, 'oldloc': oldLocation}
        }));
      }.bind(this));
  }

  _updateLocationFrames(locationId, frames) {
    if (!this.locData.locationFrames[locationId]) this.locData.locationFrames[locationId] = {};
    var frameMap = this.locData.locationFrames[locationId];
    for (var i in frames) {
      var frame = frames[i];
      frameMap[frame['id']] = {
        'origin': frameOriginLL(frame),
        'headingDeg': frame['headingDeg']
      };
    }
  }

  _updateDatastores(locationId, datastores) {
    this.locData.datastores = datastores;
    console.log('LocationData: Updated datastores:', this.locData.datastores);
  }

  _updateRoutesAndStops(locationId, routes, stops, routeMarkers) {
    if (!this.locData.routesData) this.locData.routesData = {};
    var cache = this.locData.routesData[locationId] = {};
    var idx = 0;
    for (var i in routes) {
      var route = routes[i];
      cache[route['id']] = route;
      cache[route['id']]['stops'] = [];
      cache[route['id']]['markers'] = [];
      cache[route['id']]['color'] = COLORS[idx % COLORS.length];
      idx++;
    }
    for (var i in stops) {
      var stop = stops[i];
      var routeId = stop['route-id'];
      if (!cache[routeId]) {
        console.log('LocationDataLocationData: : WARNING no route found for stop', stop);
        continue;
      }
      cache[routeId]['stops'].push(stop);
    }
    for (var i in routeMarkers) {
      var marker = routeMarkers[i];
      var routeId = marker['route-id'];
      if (!cache[routeId]) {
        console.log('LocationData: WARNING no route found for route-marker', marker);
        continue;
      }
      cache[routeId]['markers'].push(marker);
    }
    console.log('LocationData: ', this.locData.routesData);
  }

  _configFileObjectPath(locationId, filename) {
    return 'deployment-' + this.deploymentId + '/config/' + locationId
           + filename;
  }
}
window.customElements.define(LocationData.is, LocationData);
