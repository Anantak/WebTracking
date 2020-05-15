// Name of the bucket that contains the configuration data for all Anantak users.
var ANANTAK_GLOBAL_BUCKET = 'anantak-copilot-access-configs';

// Name of the deployments configuration file for each users in their respective
// bucket.
var USER_DEPLOYMENTS_OBJECT_PATH = 'deployments.json';

// Returns the path to the gcs object that contains the configuration for the
// given user.
function userConfigObjectPath(email) {
  return 'users/' + email + '.json';
}

function toUnicode(str) {
	return str.split('').map(function (value, index, array) {
		var temp = value.charCodeAt(0).toString(16).toUpperCase();
		if (temp.length > 2) {
			return '\\u' + temp;
		}
		return value;
	}).join('');
}

// ****************************************************************************
// TRACKING APP
// The main application that controls the overall navigation and the glue
// between the various submodules like maps, settings etc.
// ****************************************************************************
class TrackingApp extends Polymer.Element {
  static get is() { return 'tracking-app'; }

  static get properties() {
    return {
      page: {
        type: String,
        reflectToAttribute: true,
        observer: '_pageChanged',
      },
      routeData: Object,
      subroute: String,
      // This shouldn't be neccessary, but the Analyzer isn't picking up
      // Polymer.Element#rootPath
      rootPath: String,

      deploymentsData: Object,
      locData: Object,  // read from <location-data> and passed on to other components.
      controlAddr: {
        type: String,
        observer: '_controlAddrChanged'
      },
      videoAddr: {
        type: String,
      },
      servingFromMachine: Boolean,  // True if app is being served from HTTP server on machine.
      machineName: String,
      machineId: {
        type: String,
        observer: '_machineIdChanged'
      },
      dbControlCollection: String,
      dbCommandsCollection: String,
      dbSuperUsers: {
        type: Array,
        observer: '_dbSuperUsersChanged'
      },
      connectedToMachine: Boolean,
      connectedToDatabase: Boolean,
      headerMessage: String,
      deploymentId: String,
      deploymentLocationId: {type: String, value: ''},

      _userConfigsList: Array,
      _anantakBucket: {type: String, value: ''},

      firestoreDatabase: Object,
      controlQueryUnsubscribe: Object,
      lastMachineMessage: String,

      ipAddress: String,
      userEmailAddress: {
        type: String,
        observer: '_userEmailAddressChanged'
      },
      userCanSendCommands: {
        type: Boolean,
        value: false,
        notify: true
      },
      databaseConnectionTimerLoop: Object,
      createDatabaseConnectionTimerLoop: Object,

      userBucketsList: {type: Array, value: []},
      deploymentsDataList: {type: Array, value: []},
      controlQueryUnsubscribeList: {type: Array, value: []},
      machineControlCollections: {type: Object, value: {}, observer: '_machineControlCollectionsChanged'},
      machinesList: {type: Array, value: [], observer: '_machinesListChanged'}
    };
  }

  static get observers()
  {
    return [
      '_routePageChanged(routeData.page)',
    ];
  }

  _gapiLoaded() {
    console.log('TrackingApp: GAPI Loaded');
  }

  constructor() {
    super();
    this.servingFromMachine = isServingAppFromMachine();
    this.connectedToMachine = false;
    this.connectedToDatabase = false;
  }

  _dbSuperUsersChanged() {
    console.log('TrackingApp: _dbSuperUsersChanged: ', this.dbSuperUsers);
    this._checkIfUserCanSendCommands();
  }

  _userEmailAddressChanged() {
    console.log('TrackingApp: _userEmailAddressChanged: ', this.userEmailAddress);
    // this._checkIfUserCanSendCommands();
  }

  _machinesListChanged() {
    console.log('TrackingApp: _machinesListChanged', this.machinesList);
  }

  _machineControlCollectionsChanged() {
    console.log('TrackingApp: _machineControlCollectionsChanged', this.machineControlCollections);
  }

  _checkIfUserCanSendCommands() {
    var exists = false;
    for (var i=0; i<this.dbSuperUsers.length; i++) {
      if (this.userEmailAddress == this.dbSuperUsers[i]) {
        exists = true;
      }
    }
    this.userCanSendCommands = exists;
    console.log('TrackingApp: userCanSendCommands: ', this.userCanSendCommands);
  }

  ready()
  {
    super.ready();

    this.ipAddress = '';
    this.userEmailAddress = '';

    if (this.servingFromMachine)
    {
      console.log('TrackingApp: Serving from machine');
    //   window.fetch('data/user.txt').then(function(response)
    //   {
    //     if (response.ok)
    //     {
    //       response.text().then(function(text) { this._initForUser(text); }.bind(this));
    //     }
    //     else
    //     {
    //       alert('Could not fetch user config\nReason: ' + response.statusText);
    //     }
    //   }.bind(this));
    //
    //   // Should we still sign in, when serving from the local machine?
    //   if (this.$.gapi.libraryLoaded !== true)
    //   {
    //     console.log('TrackingApp: ERROR: GAPI not loaded. Returning.');
    //     return; // api not loaded
    //   }
    //   this.$.signin.signIn();
    //
    }
    // else
    {
      if (this.$.gapi.libraryLoaded !== true) {
        console.log('TrackingApp: GAPI not loaded. Returning.');
        return; // api not loaded
      }
      this.$.signin.signIn();
    }
  } // ready


  _subscribeToDatabase()
  {
    if (this.machineId)
    {
      // if (!this.dbControlCollection) {
        this.dbControlCollection = this.machineId+"-control";
      // }
      // if (!this.dbCommandsCollection) {
        this.dbCommandsCollection = this.machineId+"-commands";
      // }
    }
    else
    {
      alert('Did not find machineId, can not subscribe to database');
      return;
    }

    if (!this.firestoreDatabase)
    {
      this._createDbConnection();
    }

    if (this.firestoreDatabase)
    {
      this.connectedToDatabase = true;
      // Subscribe to control data
      console.log('TrackingApp: Subscribing to database for: ', this.dbControlCollection);
      this.controlQueryUnsubscribe = this.firestoreDatabase.collection(this.dbControlCollection).orderBy("timestamp", "desc").limit(1).onSnapshot(querySnapshot => {
        querySnapshot.forEach(doc => {
          if (doc.exists) {
            console.log("TrackingApp: Database message: ", doc.data());
            this.$.handheld.handleCurrentTrip(doc.data().current_trip);
            this.$.routes.handleCurrentTrip(doc.data().current_trip);
            this.$.routes.handleStatus(doc.data().status);
            this.$.routes.handleTimestamp(doc.data().timestamp);
            this.$.mapView.handleMachineLocation(doc.data().location);
            this.$.mapView.handleMachineStatus(doc.data().status);
            this.$.machineLearn.handleMachineStatus(doc.data().status);
            this.$.handheld.handleStatus(doc.data().status);
          } else {
            console.log("TrackingApp: Hist data: No document");
          }
        }, this);
      });
    }
    else
    {
      console.log('TrackingApp: ERROR: Could not subscribe to database as firestore db object is not created yet');
      this._subscribeToDatabaseIsStillPending = true;
    }

  } // _subscribeToDatabase


  _sendCommandToDatabase(msgDict) {
    if (!this.firestoreDatabase) return;
    console.log('TrackingApp: sending command:', msgDict);
    this.firestoreDatabase.collection(this.dbCommandsCollection).add(
      msgDict
    )
    .then(function(docRef) {
      console.log("TrackingApp: Command written with ID: ", docRef.id);
    })
    .catch(function(error) {
      console.error("TrackingApp: Error adding document: ", error);
    });
  }

  _unsubscribeFromDatabase() {
    this.connectedToDatabase = false;

    // Unsubscribe to control data
    if (this.controlQueryUnsubscribe) {
      this.controlQueryUnsubscribe();
    }

  } // _unsubscribeFromDatabase

  _handleSignIn()
  {
    var auth = gapi.auth2.getAuthInstance();
    if (!auth.isSignedIn.get()) {
      console.log('TrackingApp: ERROR: _handleSignIn: Not signed in. Cannot proceed');
      return;
    }
    var user = auth.currentUser.get();
    var email = user.getBasicProfile().getEmail();
    this.userEmailAddress = email;
    console.log('TrackingApp: Signed in as:', user.getBasicProfile().getEmail());
    var accessToken = user.getAuthResponse()['access_token'];

    ensureApisLoadedThen(accessToken,
      function() {
        this._initForUser(email);
      }.bind(this)
    );

    // this._createDbConnection();
    this.createDatabaseConnectionTimerLoop = setInterval(() => {
      this._checkAndCreateMultipleDBConnections();
    }, 1000);

    // Redirect to the target page
    // this._redirect_to_page();

  } // _handleSignIn

  _checkAndCreateMultipleDBConnections()
  {

    if (this._anantakBucket == '')
    {
      console.log('TrackingApp: Do not have a selected bucket name yet. Returning.');
      return;
    }

    console.log("TrackingApp: Selected bucketname: ", this._anantakBucket);

    var deploymentsData = this.deploymentsData;
    var numDeployments = deploymentsData.deployments.length;
    console.log('   num deployments: ', numDeployments);

    // We need at least one deployment to fetch the database parameters
    if (numDeployments < 1)
    {
      console.log('TrackingApp: numDeployments < 1. Returning.', numDeployments);
      return;
    }

    // We have at least one deployment. Fetch it to get the Location Data
    //  Location data will be loaded by the LocationData polymer component. We just need to set the deploymentLocationId
    if (this.deploymentsData)
    {
      var deployment = this.deploymentsData.deployments[0]; // get the first deployment
      this.deploymentId = deployment.id;
      var location = deployment.locations[0].id;
      this.deploymentLocationId = location;
      console.log('TrackingApp: deployment location id: ', this.deploymentLocationId);
    }

    // Check if the location data has been loaded
    if (!this.locData) {console.log('TrackingApp: ERROR: !this.locData'); return;}
    if (!this.locData.datastores) {console.log('TrackingApp: ERROR: !this.locData.datastores'); return;}
    if (!this.locData.datastores.length) {console.log('TrackingApp: ERROR: !this.locData.datastores.length'); return;}
    if (this.locData.datastores.length < 1) {console.log('TrackingApp: ERROR: this.locData.datastores.length < 1'); return;}

    // Check if the database connection has been created
    //  If database connection has not been created, first create that
    if (!this.firestoreDatabase)
    {
      this._createDbConnectionForMultipleMachines();
    }

    // At this point we should have a database connection
    if (!this.firestoreDatabase)
    {
      console.log('TrackingApp: ERROR: Could not subscribe to database as firestore db object is not created yet');
      this._subscribeToDatabaseIsStillPending = true;
      return;
    }

    this.connectedToDatabase = true;

    // Setup all information for each machine
    console.log('TrackingApp: Setting up machines');
    var machine_counter = 0;

    var i_deployment;
    for (i_deployment=0; i_deployment < numDeployments; i_deployment++)
    {
      var deployment = deploymentsData.deployments[i_deployment];
      var deploymentId = deployment.id;

      // We only use the first location
      var numMachines = deployment.machines.length;
      console.log('   Deployment', i_deployment, ':', deploymentId, ' #machines: ', numMachines);

      var i_machine;
      for (i_machine=0; i_machine < numMachines; i_machine++)
      {
        var machine = deployment.machines[i_machine];

        var machineId = machine.id;
        var machineName = machine.name;
        var machineLocn = machine.location;
        console.log('     Machine', machine_counter, ':', machineId, ',', machineLocn);

        // Create subscription to database for this machine
        var dbMachineControlCollection = machineId+"-control";
        var dbMachineCommandsCollection = machineId+"-commands";

        var machineData = {
          'machineId': machineId,
          'machineName': machineName,
          'machineLocn': machineLocn,
          'deploymentId': deploymentId
        };

        this.machineControlCollections[dbMachineControlCollection] = machineData;

        this.machinesList.push(machineData);

        // Subscribe to control data
        console.log('       Subscribing to database for: ', dbMachineControlCollection);
        var controlQueryUnsubscribe =
          this.firestoreDatabase.collection(dbMachineControlCollection).orderBy("timestamp", "desc").limit(1).onSnapshot(
            (querySnapshot) =>
          {
            querySnapshot.forEach(
              (doc) =>
            {
              if (doc.exists)
              {
                // console.log("TrackingApp: Database message: ", doc.ref.parent.id, doc.data());
                this.handleMachineControlDatabaseMessage(doc.ref.parent.id, doc.data());
              }
              else
              {
                console.log("TrackingApp: Hist data: No document");
              }
            }, this);
          }
        );

        this.controlQueryUnsubscribeList.push(controlQueryUnsubscribe);

        machine_counter++;

      } // for each machine
    } // for each deployment

    console.log('TrackingApp: Created ', this.controlQueryUnsubscribeList.length, 'database subscriptions');

    // Clear the interval timer to create the DB connections
    //  This procedure will not be called repeatedly anymore
    clearInterval(this.createDatabaseConnectionTimerLoop);

    // Assign list of machines
    this.$.view1.assignMachinesList(this.machinesList);
  }

  handleMachineControlDatabaseMessage(control_collection_id, doc_data)
  {
    console.log('TrackingApp: control message from ', control_collection_id, doc_data);

    if (!this.machineControlCollections[control_collection_id]) return;

    var machine_id = this.machineControlCollections[control_collection_id].machineId;

    console.log('  machine: ', machine_id);

    this.$.view1.assignMachineData(machine_id, doc_data);
  }

  _createDbConnectionForMultipleMachines()
  {
    // Check if we can create a db connection
    if (!this.locData) {console.log('TrackingApp: ERROR: !this.locData'); return;}
    if (!this.locData.datastores) {console.log('TrackingApp: ERROR: !this.locData.datastores'); return;}
    if (!this.locData.datastores.length) {console.log('TrackingApp: ERROR: !this.locData.datastores.length'); return;}
    if (this.locData.datastores.length < 1) {console.log('TrackingApp: ERROR: this.locData.datastores.length < 1'); return;}

    // Initialize Cloud Firestore
    console.log("TrackingApp: Logging in to the Firestore database");

    {
      var datastore = this.locData.datastores[0];
      this.datastore = datastore;
      console.log('TrackingApp: Found datastore[0]', this.datastore);
    }

    if (this.datastore)
    {
      this.apiKey = this.datastore["api-key"];
      this.authDomain = this.datastore["auth-domain"];
      this.databaseUrl = this.datastore["database-url"];
      this.projectId = this.datastore["project-id"];
      this.storageBucket = this.datastore["storage-bucket"];
      this.messagingSenderId = this.datastore["messaging-sender-id"];
      // this.dbCollection = this.machineId+"-commands";
      // this.dbDocument = this.machineId;
    }

    var config =
    {
      apiKey: this.apiKey,
      authDomain: this.authDomain,
      databaseURL: this.databaseURL,
      projectId: this.projectId,
      storageBucket: this.storageBucket,
      messagingSenderId: this.messagingSenderId
    };
    firebase.initializeApp(config);

    const firestore = firebase.firestore();
    const settings = {/* your settings... */ timestampsInSnapshots: true};
    firestore.settings(settings);

    // User authorization
    var googleAuth = gapi.auth2.getAuthInstance();
    if (!googleAuth.isSignedIn.get()) {
      console.log('TrackingApp: Not signed in. Cannot connect to database.');
      return;
    }
    var googleUser = googleAuth.currentUser.get();
    var googleEmail = googleUser.getBasicProfile().getEmail();
    // this.googleUser = googleEmail;
    console.log('TrackingApp: Database login: user email: ', googleEmail);
    // console.log('**** id token: ', googleUser.getAuthResponse().id_token);
    var credential = firebase.auth.GoogleAuthProvider.credential(
              googleUser.getAuthResponse().id_token);
    firebase.auth().signInAndRetrieveDataWithCredential(credential).catch(function(error)
    {
      // Handle Errors here.
      var errorCode = error.code;
      var errorMessage = error.message;
      // The email of the user's account used.
      var email = error.email;
      // The firebase.auth.AuthCredential type that was used.
      var credential = error.credential;
      // ...
      console.log('TrackingApp: ERROR: Could not login to the database', errorCode, errorMessage);
    });

    // Initialize Cloud Firestore through Firebase
    this.firestoreDatabase = firebase.firestore();

    console.log('TrackingApp: Firestore database created');

  } // Create DB Connection for multiple machines


  _redirect_to_page() {
    var stored_startingPage = localStorage.getItem("startingPage");
    if (stored_startingPage) {
      console.log('TrackingApp: Redirecting to user preferred page: ', stored_startingPage);
      this.set('route.path', stored_startingPage);
    }
  }


  _createDbConnection()
  {
    if (this.machineId)
    { // Initialize Cloud Firestore

      if (!this.locData) {console.log('TrackingApp: ERROR: !this.locData'); return;}
      if (!this.locData.datastores) {console.log('TrackingApp: ERROR: !this.locData.datastores'); return;}
      if (!this.locData.datastores.length) {console.log('TrackingApp: ERROR: !this.locData.datastores.length'); return;}
      if (this.locData.datastores.length < 1) {console.log('TrackingApp: ERROR: this.locData.datastores.length < 1'); return;}

      console.log("TrackingApp: Logging in to the Firestore database");

      console.log('TrackingApp:  Getting datastore for:', this.machineId);
      for (var i=0; i<this.locData.datastores.length; i++)
      {
        var datastore = this.locData.datastores[i];
        if (datastore["id"] == this.machineId)
        {
          this.datastore = datastore;
          console.log('TrackingApp: Found datastore', this.datastore);
        }
      }

      if (this.datastore)
      {
        this.apiKey = this.datastore["api-key"];
        this.authDomain = this.datastore["auth-domain"];
        this.databaseUrl = this.datastore["database-url"];
        this.projectId = this.datastore["project-id"];
        this.storageBucket = this.datastore["storage-bucket"];
        this.messagingSenderId = this.datastore["messaging-sender-id"];
        this.dbCollection = this.machineId+"-commands";
        this.dbDocument = this.machineId;
      }

      var config =
      {
        apiKey: this.apiKey,
        authDomain: this.authDomain,
        databaseURL: this.databaseURL,
        projectId: this.projectId,
        storageBucket: this.storageBucket,
        messagingSenderId: this.messagingSenderId
      };
      firebase.initializeApp(config);

      const firestore = firebase.firestore();
      const settings = {/* your settings... */ timestampsInSnapshots: true};
      firestore.settings(settings);

      // User authorization
      var googleAuth = gapi.auth2.getAuthInstance();
      if (!googleAuth.isSignedIn.get()) {
        console.log('TrackingApp: Not signed in. Cannot connect to database.');
        return;
      }
      var googleUser = googleAuth.currentUser.get();
      var googleEmail = googleUser.getBasicProfile().getEmail();
      // this.googleUser = googleEmail;
      console.log('TrackingApp: Database login: user email: ', googleEmail);
      // console.log('**** id token: ', googleUser.getAuthResponse().id_token);
      var credential = firebase.auth.GoogleAuthProvider.credential(
                googleUser.getAuthResponse().id_token);
      firebase.auth().signInAndRetrieveDataWithCredential(credential).catch(function(error) {
        // Handle Errors here.
        var errorCode = error.code;
        var errorMessage = error.message;
        // The email of the user's account used.
        var email = error.email;
        // The firebase.auth.AuthCredential type that was used.
        var credential = error.credential;
        // ...
        console.log('TrackingApp: ERROR: Could not login to the database', errorCode, errorMessage);
      });

      // Initialize Cloud Firestore through Firebase
      this.firestoreDatabase = firebase.firestore();

    } // Cloud Firestore
  }


  _checkAndCreateDBConnection()
  {
    if (!this.firestoreDatabase)
    {
      this._createDbConnection();
    }
    else
    {
      if (this._subscribeToDatabaseIsStillPending)
      {
        this._subscribeToDatabase();
        delete this._subscribeToDatabaseIsStillPending;
      }
      clearInterval(this.createDatabaseConnectionTimerLoop);
    }
  }


  _machineIdChanged() {
    console.log('TrackingApp: Machineid changed. Need to redo database connections for ', this.machineId);

    if (this.controlAddr && this.controlAddr.startsWith('anantak_cloud')) {

      // Remove current database query connections
      this._unsubscribeFromDatabase();

      // Resubscribe with new machine id
      this._subscribeToDatabase();
    }
  }


  _initForUser(email)
  {
    fetchUserConfig(email, function(userConfigsList)
    {
      this._userConfigsList = userConfigsList;
      if (userConfigsList.length == 0)
      {
        alert('CopilotApp: No user config found. Cannot proceed');
        return;
      }
      else if (userConfigsList.length == 1)
      {
        this._anantakBucket = userConfigsList[0]['bucket'];
        loadDeployments(this._anantakBucket, USER_DEPLOYMENTS_OBJECT_PATH,
          function(obj) {
            console.log('CopilotApp: Deployments data loaded');
            this.deploymentsData = JSON.parse(obj);
            console.log('CopilotApp: deploymentsData: ', this.deploymentsData);
          }.bind(this));
      }
      else
      {  // multiple projects for this user
        console.log('CopilotApp: Multiple user configs. Prompting the user.');
        this.$['project-selection-dialog'].open();
      }
    }.bind(this));
  } // _initForUser


  _onProjectSelection(e)
  {
    this.$['project-selection-dialog'].close();
    var bucket = e.target.getAttribute('bucket');
    console.log('TrackingApp: Selected bucket', bucket);
    this._anantakBucket = bucket;
    loadDeployments(this._anantakBucket, USER_DEPLOYMENTS_OBJECT_PATH,
      function(obj) {
        console.log('TrackingApp: Deployments data loaded');
        this.deploymentsData = JSON.parse(obj);
        console.log('TrackingApp: deploymentsData: ', this.deploymentsData);
      }.bind(this));
  }

  _routePageChanged(page)
  {
    this.page = page || 'view1';

    // Close a non-persistent drawer when the page & route are changed.
    if (!this.$.drawer.persistent)
    {
      this.$.drawer.close();
    }
  }

  _pageChanged(page)
  {
    var resolvedPageUrl = this.resolveUrl('my-' + page + '.html');
    Polymer.importHref(
        resolvedPageUrl,
        null,
        this._showPage404.bind(this),
        true);
  }

  _showPage404() {
    this.page = 'view404';
  }

  _showStatusPage() {
    this.page = 'view404';
  }

  _controlAddrChanged(newAddress, oldAddress) {
    console.log('TrackingApp: Control address updated: ', newAddress);
    // Close last websocket connection
    if (oldAddress != null) {
      if (oldAddress && oldAddress.startsWith('anantak_cloud')) {
        console.log('TrackingApp: Disconnecting from anantak cloud for data');
        this._unsubscribeFromDatabase();
        clearInterval(this.databaseConnectionTimerLoop);
      } else {
        console.log('TrackingApp: Closing websocket connection');
        closeConnection(oldAddress);
        this.connectedToMachine = false;
      }
    }
    // Create new websocket connection
    if (newAddress.startsWith('anantak_cloud')) {
      console.log('TrackingApp: Connecting to anantak cloud for data');
      this._subscribeToDatabase();
      this.databaseConnectionTimerLoop = setInterval(() => {
        this.runDatabaseConnectionLoop();
      }, 333);
    }
    else {
      console.log('TrackingApp: Creating websocket connection');
      this.statusConn = this._resetMachineConnection(newAddress);
      console.log('TrackingApp: Websocket object:', gWebSockets[newAddress]);
    }
  }

  getIpAddress() {
    fetch('https://api.ipify.org?format=json')
    .then(res => res.json())
    .then((out) => {
      this.ipAddress = out.ip;
      console.log('TrackingApp: IP json from ipify: ', out);
    })
    .catch(err => { throw err });
  }

  getUserEmailAddress() {
    var auth = gapi.auth2.getAuthInstance();
    if (!auth.isSignedIn.get()) {
      console.log('TrackingApp: Not signed in. Cannot send commands.');
      return;
    }
    var googleUser = auth.currentUser.get();
    var googleEmail = googleUser.getBasicProfile().getEmail();
    this.userEmailAddress = googleEmail;
    console.log('TrackingApp: user email: ', this.userEmailAddress);
  }

  createDatabaseCommandMsg(msgStr) {

    if (this.ipAddress == '') {
      this.getIpAddress();
    }

    if (this.userEmailAddress == '') {
      this.getUserEmailAddress();
    }

    var command_msg = {
      'timestamp': Date.now(),
      'command': 'ZmqCommand',
      'user': this.userEmailAddress,
      'ip': this.ipAddress,
      'details': {
        'json': msgStr,
        'src': 'WebApp'
      }
    };
    return command_msg;
  }

  runDatabaseConnectionLoop() {
    // console.log("TrackingApp: Running runDatabaseConnectionLoop");
    var msgHandler = createControlMsgHandler({
      'status': [
        //createIfDefinedCb(this.$.machineStatus, 'handleStatus'),  // Manuj: Deactivating this for now
        // createIfDefinedCb(this.$.appSettings, 'handleStatus'),
        // createIfDefinedCb(this.$.routes, 'handleStatus'), // Manuj: Added handleStatus to machine-routes
        // createIfDefinedCb(this.$.mapView, 'handleMachineStatus'), // Manuj: Added handleMachineStatus to map-view
        // this._handleStatus.bind(this)
      ],
      // 'location': [createIfDefinedCb(this.$.mapView, 'handleMachineLocation')],
      // 'current_trip': [createIfDefinedCb(this.$.routes, 'handleCurrentTrip')],
      // 'camera': [createIfDefinedCb(this.$.machineCamera, 'handleCamera')],
      // 'timestamp': [createIfDefinedCb(this.$.routes, 'handleTimestamp')]
    }, {
      'control': createIfDefinedCb(this.$.machineCamera, 'getControl'),
      'camera': createIfDefinedCb(this.$.machineCamera, 'getCamera'),
      'current_trip': createIfDefinedCb(this.$.routes, 'getCurrentTrip'),
      'handheld': createIfDefinedCb(this.$.handheld, 'getCurrentTrip'),
      'learn': createIfDefinedCb(this.$.machineLearn, 'getCurrentLearnMode'),
    });

    var outMsg = msgHandler("");

    var currentTrip = outMsg['current_trip'];
    var learn = outMsg['learn'];
    var control = outMsg['control'];
    var joy_stick_is_valid = false;

    if (control && (control['active'] > 0)) {
      // if ((control['joy_x'] != 0) || (control['joy_y'] != 0)) {
        console.log('TrackingApp: joy: ',control['joy_x'],control['joy_y']);
        // Add the fact that this is a database message. This information is used by the machine to know that next message will come after a while
        control.cloud = 1;
        joy_stick_is_valid = true;
      // }
    }

    if ((Object.keys(currentTrip).length != 0) || (learn) || (joy_stick_is_valid)) {
      var outMsgStr = JSON.stringify(outMsg);
      var dbMsg = this.createDatabaseCommandMsg(outMsgStr);
      console.log('TrackingApp: Cloud database command to send: ', outMsgStr);
      this._sendCommandToDatabase(dbMsg);
    }

  }

  _resetMachineConnection(address) {
    return startConnection(
        address,
        createControlMsgHandler({
          'status': [
            //createIfDefinedCb(this.$.machineStatus, 'handleStatus'),  // Manuj: Deactivating this for now
            createIfDefinedCb(this.$.appSettings, 'handleStatus'),
            createIfDefinedCb(this.$.routes, 'handleStatus'), // Manuj: Added handleStatus to machine-routes
            createIfDefinedCb(this.$.mapView, 'handleMachineStatus'), // Manuj: Added handleMachineStatus to map-view
            createIfDefinedCb(this.$.machineLearn, 'handleMachineStatus'), // Manuj: Added handleMachineStatus to machineLearn
            createIfDefinedCb(this.$.handheld, 'handleStatus'), // Manuj: Added handleStatus to machine-routes
            this._handleStatus.bind(this)
          ],
          'location': [createIfDefinedCb(this.$.mapView, 'handleMachineLocation')],
          'current_trip': [
            createIfDefinedCb(this.$.handheld, 'handleCurrentTrip'),
            createIfDefinedCb(this.$.routes, 'handleCurrentTrip')
          ],
          'camera': [createIfDefinedCb(this.$.machineCamera, 'handleCamera')],
          'timestamp': [createIfDefinedCb(this.$.routes, 'handleTimestamp')]
        }, {
          'control': createIfDefinedCb(this.$.machineCamera, 'getControl'),
          'camera': createIfDefinedCb(this.$.machineCamera, 'getCamera'),
          'current_trip': createIfDefinedCb(this.$.routes, 'getCurrentTrip'),
          'handheld': createIfDefinedCb(this.$.handheld, 'getCurrentTrip'),
          'learn': createIfDefinedCb(this.$.machineLearn, 'getCurrentLearnMode'),
        }),
        function(connected) { this.connectedToMachine = connected; }.bind(this));
  }

  _handleStatus(status) {
    // var controlModeName = CONTROL_MODES.filter(
    //   function(mode) {
    //     return mode.value == status.control_mode;
    //   })[0].name;
    //this.headerMessage = 'Copilot: ' + this.machineName + ', ' + controlModeName;
    //this.headerMessage = (this.machineName) ? this.machineName : 'Anantak machine not connected';
  }

  _deploymentDataUpdated(e) {
    // this.$.mapView.deploymentDataUpdated(e.detail);
    // this.$.routes.deploymentDataUpdated(e.detail);
  }

}
window.customElements.define(TrackingApp.is, TrackingApp);

// Fetches the user config from the global Anantak project and passes on to the
// given callback.
function fetchUserConfig(email, callback) {
  fetchGcsObject(ANANTAK_GLOBAL_BUCKET, userConfigObjectPath(email),
                 function(response) {
    var config = JSON.parse(response);
    console.log('TrackingApp: User configs: ', config);
    callback(config);
  });
}

function loadDeployments(anantakBucket, deploymentsFile, callback) {
  fetchGcsObject(anantakBucket, deploymentsFile, function(obj) {
    callback(obj);
  });
}
