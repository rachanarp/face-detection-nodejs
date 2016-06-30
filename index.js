/**
 * Simple example Node.js application to demonstrate face detection.
 */

/**
 * Define the dependencies
 */
var express   =   require( 'express' )
  , http       =    require( 'http' )
  , async     =    require( 'async' )
  , multer    =   require( 'multer' )
  , upload     =    multer( { dest: 'uploads/' } )
  , exphbs    =   require( 'express-handlebars' )
  , easyimg   =    require( 'easyimage' )
  , _         =    require( 'lodash' )
  , cv         =   require( 'opencv' );

/**
 * Create a simple hash of MIME types to file extensions
 */
var exts = {
  'image/jpeg'   :   '.jpg',
  'image/png'    :   '.png',
  'image/gif'    :   '.gif'
}

/**
 * Note that you may want to change this, depending on your setup.
 */
var port = 8080;

/**
 * Create the express app
 */
var app = express();

/**
 * Set up the public directory
 */
app.use(express.static(__dirname + '/public'))

/**
 * Set up Handlebars templating
 */
app.engine('.hbs', exphbs( { extname: '.hbs', defaultLayout: 'default' } ) );
app.set( 'view engine', '.hbs' );

/**
 * Default page; simply renders a file upload form
 */
app.get('/', function( req, res, next ) {

  return res.render('index');

});

/**
 * POST callback for the file upload form. This is where the magic happens.
 */
app.post('/upload', upload.single('file'), function(req, res, next){

  // Generate a filename; just use the one generated for us, plus the appropriate extension
  var filename = req.file.filename + exts[req.file.mimetype]
    // and source and destination filepaths
    , src = __dirname + '/' + req.file.path
    , dst = __dirname + '/public/images/' + filename;

  /**
   * Go through the various steps
   */
  async.waterfall(
    [
      function( callback ) {

        /**
         * Check the mimetype to ensure the uploaded file is an image
         */
        if (!_.contains(
          [
            'image/jpeg',
            'image/png',
            'image/gif'
          ],
          req.file.mimetype
        ) ) {

          return callback( new Error( 'Invalid file - please upload an image (.jpg, .png, .gif).' ) )

        }

        return callback();

      },
      function( callback ) {

        /**
         * Get some information about the uploaded file
         */
        easyimg.info( src ).then(

          function(file) {

            /**
             * Check that the image is suitably large
             */
            if ( ( file.width < 960 ) || ( file.height < 300 ) ) {

              return callback( new Error( 'Image must be at least 640 x 300 pixels' ) );

            }

            return callback();
          }
        );
      },
      function( callback ) {

        /**
         * Resize the image to a sensible size
         */
        easyimg.resize(
          {
            width      :   960,
            src        :   src,
            dst        :   dst
          }
        ).then(function(image) {
          this.fileHeight = image.height;
          return callback();

        });

      },
      function( callback ) {

        /**
         * Use OpenCV to read the (resized) image
         */
        cv.readImage( dst, callback );

      },
      function( im, callback ) {

        /**
         * Run the face detection algorithm
         */
        im.detectObject( cv.FACE_CASCADE, {}, callback );

      }

    ],
    function( err, faces ) {

      var topOfTop = 99999;
      var bottomOfBottom = 0;
      for (var i = 0; i < faces.length; i++) {
        var face = faces[i];
        topOfTop = Math.min(topOfTop, face.y);
        bottomOfBottom = Math.max(bottomOfBottom, face.y + face.height);
      }


      var windowSize = this.fileHeight / 3 || 400;
      var bestTopHeight = 0;
      var bestScore = 0;
      for (var i = 0; i < (this.fileHeight - windowSize); i+=1) {
        var myScore = 0;
        var windowTop = i;
        var windowBottom = i + windowSize;
        for (var f = 0; f < faces.length; f++) {
          var face = faces[f];
          var myTop = face.y;
          var myBottom = face.y + face.height;
          if (myBottom < windowTop) {
            // above range
          } else if (myTop > windowBottom) {
            // below range
          } else if (myTop > windowTop && myBottom < windowBottom) {
            // totally inside
            myScore += face.height;
            // bonus for centeredness
            var centeredness = Math.abs((windowBottom - myBottom) - (myTop - windowTop)) + 1;
            myScore += face.height / centeredness;
          } else if (myTop < windowTop && myBottom > windowBottom) {
            // bigger than window
            myScore += windowSize;
            // bonus for centeredness
            var centeredness = Math.abs((myBottom - windowBottom) - (windowTop - myTop)) + 1;
            myScore += face.height / centeredness;
          } else if (myTop < windowTop) {
            // partially off top
            myScore += (myBottom - windowTop);
          } else {
            // partially off bottom
            myScore += (windowBottom - myBottom);
          }
        }
        if (myScore > bestScore) {
          bestScore = myScore;
          bestTopHeight = i;
        }
      }
      var minTop = bestTopHeight || '50%';

      // var minTop = 0;

      // for (var i=0; i<faces.length; ++i) {
      //   var face = faces[i];
      //   if (i == 0) {
      //     minTop = face["y"];
      //   } else if (face["y"] < minTop) {
      //     minTop = face["y"];
      //   }
      // }


      /**
       * If an error occurred somewhere along the way, render the
       * error page.
       */
      if ( err ) {

        return res.render(
          'error',
          {
            message : err.message
          }
        );
      }

      /**
       * We're all good; render the result page.
       */
      return res.render(
        'result',
        {
          filename   :   filename,
          faces     :   faces,
          minTop : minTop.toString().indexOf('%') === -1 ? ('-' + minTop + 'px') : minTop
        }
      );

    }
  );

});

/**
 * Start the server
 */
http.createServer(
  app
).listen( port, function( server ) {
  console.log( app );
  console.log( 'Listening on port %d', port );
});
