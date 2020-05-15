function isServingAppFromMachine() {
  // return !window.location.host.includes('anantak.com') &&
  //        !window.location.host.includes('appspot.com');
  return false;
}

// Ensures that the required Google APIs are loaded first and then invokes the
// given callback.
function ensureApisLoadedThen(accessToken, callback) {
  var GCS_DISCOVERY_URL = 'https://www.googleapis.com/discovery/v1/apis/storage/v1/rest';
  gapi.load('client', function() {
    console.log('Initiating GAPI client with token', accessToken);
    gapi.client.setToken({'access_token': accessToken});
    gapi.client.init({
      'discoveryDocs': [GCS_DISCOVERY_URL]
    }).then(function() {
      callback();
    }, function(reason) {
      console.log('Could not init gapi: ', reason);
    });
  });
}

function filepath(bucket, objectName) {
  return (isServingAppFromMachine() ? 'data/' : 'https://storage.cloud.google.com/')
                + bucket + '/' + objectName;
}

// Fetches a single object from GCS and calls the given callback.
function fetchGcsObject(bucket, objectName, responseHandler) {
  console.log('Fetching', bucket, '#', objectName);
  if (!isServingAppFromMachine()) {
    gapi.client.storage.objects.get({
      'bucket': bucket,
      'object': objectName,
      'alt': 'media'
    }).then(function(response) {
      responseHandler(response.body);
    }, function(reason) {
      console.log(reason);
      alert('Could not fetch ', objectName, reason.body);
    });
  } else {
    window.fetch('data/' + bucket + '/' + objectName).then(function(response) {
      if (response.ok) {
        return response.text();
      } else {
        console.log(response.statusText);
        alert('Could not fetch "' + objectName + '"\nReason: ' + response.statusText);
      }
    }).then(function(text) {
      responseHandler(text);
    });
  }
}

// Saves a single object to GCS and calls the given callback.
function saveGcsObject(bucket, objectName, objString, responseHandler) {
  console.log('Saving', bucket, '#', objectName);

  // if (!isServingAppFromMachine()) {
    // gapi.client.storage.objects.insert({
    //   'bucket': bucket,
    //   'object': objectName,
    //   'uploadType': 'media',
    //   'body': objString,
    // }).then(function(response) {
    //   responseHandler(response.body);
    // }, function(reason) {
    //   console.log('ERROR saving:',reason);
    //   // alert('Could not save ', objectName, reason.body);
    // });
  // } else {
    // window.fetch('data/' + bucket + '/' + objectName).then(function(response) {
    //   if (response.ok) {
    //     return response.text();
    //   } else {
    //     console.log(response.statusText);
    //     alert('Could not fetch "' + objectName + '"\nReason: ' + response.statusText);
    //   }
    // }).then(function(text) {
    //   responseHandler(text);
    // });
  // }

  // const boundary = '-------314159265358979323846';
  // const delimiter = "\r\n--" + boundary + "\r\n";
  // const close_delim = "\r\n--" + boundary + "--";
  //
  // var contentType = 'application/json';
  // var metadata = {
  //   'name': objectName,
  //   'mimeType': contentType
  // };
  //
  // var multipartRequestBody =
  //   delimiter +
  //   'Content-Type: application/json\r\n\r\n' +
  //   JSON.stringify(metadata) +
  //   delimiter +
  //   'Content-Type: ' + contentType + '\r\n' +
  //   'Content-Transfer-Encoding: base64\r\n' +
  //   '\r\n' +
  //   objString +
  //   close_delim;

  var API_VERSION = 'v1';
  var BUCKET = bucket;

  // // var request = gapi.client.request({
  // //          'path': '/upload/storage/' + API_VERSION + '/b/' + BUCKET + '/o',
  // //          'method': 'POST',
  // //          'params': {
  // //               'uploadType': 'multipart',
  // //               'contentEncoding': '',
  // //               'name': 'Test00.json'
  // //               },
  // //          'headers': {
  // //            'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
  // //          },
  // //          'body': multipartRequestBody});

  // gapi.client.init({
  //     // 'apiKey': 'AIzaSyBWWjgUlyjcWKkBc9iUHLPJ2WCroHgIuXY',
  //     // 'clientId': '329567572907-temfoohsqmaljmqdnu929so5lktuv9b4.apps.googleusercontent.com',
  //     'discoveryDocs': ['https://www.googleapis.com/discovery/v1/apis/storage/v1/rest'],
  //     'scope': 'https://www.googleapis.com/auth/devstorage.read_write'
  // }).then(function() {

    console.log('Authorizing');

    // User authorization
    var auth = gapi.auth2.getAuthInstance();
    if (!auth.isSignedIn.get()) {
      alert('Not signed in. Cannot connect to storage.');
      return;
    }
    var googleUser = auth.currentUser.get();
    var googleEmail = googleUser.getBasicProfile().getEmail();
    console.log('Storage login: user email: ', googleEmail);
    console.log('**** access token: ', googleUser.getAuthResponse().access_token);

    var request = gapi.client.request({
             'path': '/upload/storage/' + API_VERSION + '/b/' + BUCKET + '/o',
             'method': 'POST',
             'params': {
                  'uploadType': 'media',
                  // 'project': 710330629507,
                  'name': objectName //'Test00.json'
                  },
             'headers': {
               'Content-Type': 'application/json',
               'Content-Length': objString.length,
               // 'x-goog-project-id': 706073207153,
               'Authorization': 'Bearer '+googleUser.getAuthResponse().access_token
               // 'Authorization': 'Bearer ya29.GlsvBmoiloQYs7t-8vuhK6a2N1OLbyOWgNy_9OarUcCZTexqFj569HzwaDdmM29aFuAyAyM9JubymG4H9RnNDe_h8tcW3riRbRqJ3F_7SUj9QxvD9KydVVClmuCb'
             },
             'body': objString});

      //   // var request = gapi.client.request({
      //   //          'path': '/storage/' + API_VERSION + '/b/' + BUCKET + '/o',
      //   //          'method': 'GET',
      //   //          'headers': {
      //   //              'Authorization': 'Bearer '+googleUser.getAuthResponse().access_token
      //   //            }
      //   //          });

     try {
       //Execute the insert object request
       console.log('Executing request');
       request.execute(function(resp) {
         console.log('Response: ', resp);
       }, function(reason) {
         console.log('Reason: ', reason);
       });
     }
     catch(e) {
       console.log('ERROR: ' + e.message);
     }

   // }, function(e) {
   //   console.log(e);
   // });

}

// Fetches multiple objects from GCS one-by-one and calls the given callback with
// a map from the oject name to its fetched data.
function fetchGcsObjects(bucket, objectNames, responseHandler) {
  if (!objectNames.length) {
    responseHandler({});
    return;
  }
  fetchGcsObject(bucket, objectNames[0], function(response) {
    fetchGcsObjects(bucket, objectNames.slice(1), function(responses) {
      responses[objectNames[0]] = response;
      responseHandler(responses);
    });
  });
}

// Creates a function for the given method on the given object which is called
// only if both the object and the method are actually defined. Used for
// defining repeatable callbacks on objects that might not exist initially
// but might be initialized after a while, say when an API is loaded, e.g. the
// GMap object is intialized only after the Maps API is loaded.
function createIfDefinedCb(obj, methodName) {
  return function() {
    if (obj && obj[methodName]) {
      return obj[methodName].apply(obj, arguments);
    }
  };
}

function createControlMsgHandler(handlers, setters) {
  return function(msg) {
    for (var key in handlers) {
      var hlist = handlers[key];
      for (var i in hlist) {
        hlist[i](msg[key]);
      }
    }

    var d = new Date();
    var ts = d.getTime();
    var outMsg = {
      'subject': 'remote',
      'in_ts': msg.timestamp,
      'out_ts': ts
    };

    for (prop in setters) {
      outMsg[prop] = setters[prop]();
    }
    return outMsg;
  };
}

// var CONTROL_MODES = [
//   {'value': '1', 'name': 'Line follow, auto, stop at markers'},
//   {'value': '2', 'name': 'Line follow, auto, stop at stations'},
//   {'value': '3', 'name': 'Route follow, auto, stop at markers'},
//   {'value': '4', 'name': 'Line follow, manual forward'},
//   {'value': '5', 'name': 'Route follow, manual forward'},
//   {'value': '6', 'name': 'Remote control'}
// ];

var CONTROL_MODES = [
  {'value': '1', 'name': 'Route follow'},
  {'value': '2', 'name': 'Remote control'}
];
