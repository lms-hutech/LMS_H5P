/** @namespace H5P */
H5P.VideoGoogleDrive = (function ($) {

  /**
   * Google Drive video player for H5P.
   * Uses Google Drive's embed preview player via iframe.
   *
   * @class
   * @param {Array} sources Video files to use
   * @param {Object} options Settings for the player
   * @param {Object} l10n Localization strings
   */
  function GoogleDrive(sources, options, l10n) {
    var self = this;

    var id = 'h5p-gdrive-' + numInstances;
    numInstances++;

    var fileId = getFileId(sources[0].path);
    var $wrapper = $('<div/>');
    var ratio = 9 / 16;
    var currentTime = options.startAt || 0;
    var duration = 0;
    var isMutedState = false;
    var volumeLevel = 100;
    var currentState = H5P.Video.PAUSED;
    var playbackRate = 1;
    var iframe;

    /**
     * Append the player to the DOM.
     *
     * @public
     * @param {jQuery} $container
     */
    self.appendTo = function ($container) {
      $container.addClass('h5p-google-drive').append($wrapper);
      create();
    };

    /**
     * Create the Google Drive iframe embed player.
     *
     * @private
     */
    var create = function () {
      if (iframe) return;

      var width = $wrapper.width() || 640;
      var height = Math.round(width * ratio);

      iframe = document.createElement('iframe');
      iframe.id = id;
      iframe.src = 'https://drive.google.com/file/d/' + fileId + '/preview';
      iframe.width = width;
      iframe.height = height;
      iframe.style.cssText = 'border:none;width:100%;height:100%;';
      iframe.setAttribute('allow', 'autoplay; encrypted-media');
      iframe.setAttribute('allowfullscreen', 'true');

      $wrapper.css({
        width: '100%',
        paddingTop: (ratio * 100) + '%',
        position: 'relative'
      });

      var iframeWrapper = document.createElement('div');
      iframeWrapper.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
      iframeWrapper.appendChild(iframe);
      $wrapper[0].appendChild(iframeWrapper);

      // Fire ready/loaded events after iframe loads
      iframe.onload = function () {
        self.trigger('ready');
        self.trigger('loaded');

        if (options.autoplay) {
          currentState = H5P.Video.PLAYING;
          self.trigger('stateChange', H5P.Video.PLAYING);
        }
      };
    };

    /**
     * Start the video.
     * @public
     */
    self.play = function () {
      currentState = H5P.Video.PLAYING;
      self.trigger('stateChange', H5P.Video.PLAYING);
    };

    /**
     * Pause the video.
     * @public
     */
    self.pause = function () {
      currentState = H5P.Video.PAUSED;
      self.trigger('stateChange', H5P.Video.PAUSED);
    };

    /**
     * Seek video to given time.
     * @public
     * @param {Number} time
     */
    self.seek = function (time) {
      currentTime = time;
    };

    /**
     * Get elapsed time since video beginning.
     * @public
     * @returns {Number}
     */
    self.getCurrentTime = function () {
      return currentTime;
    };

    /**
     * Get total video duration time.
     * @public
     * @returns {Number}
     */
    self.getDuration = function () {
      return duration;
    };

    /**
     * Get percentage of video that is buffered.
     * @public
     * @returns {Number}
     */
    self.getBuffered = function () {
      return 100;
    };

    /**
     * Turn off video sound.
     * @public
     */
    self.mute = function () {
      isMutedState = true;
    };

    /**
     * Turn on video sound.
     * @public
     */
    self.unMute = function () {
      isMutedState = false;
    };

    /**
     * Check if video sound is turned on or off.
     * @public
     * @returns {Boolean}
     */
    self.isMuted = function () {
      return isMutedState;
    };

    /**
     * Return the video sound level.
     * @public
     * @returns {Number}
     */
    self.getVolume = function () {
      return volumeLevel;
    };

    /**
     * Set video sound level.
     * @public
     * @param {Number} level
     */
    self.setVolume = function (level) {
      volumeLevel = level;
    };

    /**
     * Get list of available playback rates.
     * @public
     * @returns {Array}
     */
    self.getPlaybackRates = function () {
      return [0.25, 0.5, 1, 1.5, 2];
    };

    /**
     * Get current playback rate.
     * @public
     * @returns {Number}
     */
    self.getPlaybackRate = function () {
      return playbackRate;
    };

    /**
     * Set current playback rate.
     * @public
     * @param {Number} rate
     */
    self.setPlaybackRate = function (rate) {
      playbackRate = rate;
    };

    /**
     * Resize handler.
     */
    self.on('resize', function () {
      if (!$wrapper.is(':visible')) return;

      if (!iframe) {
        create();
        return;
      }

      var width = $wrapper[0].clientWidth;
      if (width > 0) {
        $wrapper.css({
          width: width + 'px'
        });
      }
    });
  }

  /**
   * Check to see if we can play any of the given sources.
   *
   * @public
   * @static
   * @param {Array} sources
   * @returns {Boolean}
   */
  GoogleDrive.canPlay = function (sources) {
    return getFileId(sources[0].path) !== undefined;
  };

  /**
   * Find Google Drive file ID from given URL.
   *
   * @private
   * @param {String} url
   * @returns {String} Google Drive file identifier
   */
  var getFileId = function (url) {
    // Match: drive.google.com/file/d/FILE_ID/...
    var matches = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
    if (matches && matches[1]) {
      return matches[1];
    }

    // Match: drive.google.com/uc?...id=FILE_ID
    matches = url.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/i);
    if (matches && matches[1]) {
      return matches[1];
    }

    // Match: drive.google.com/open?id=FILE_ID
    matches = url.match(/drive\.google\.com\/open\?.*id=([a-zA-Z0-9_-]+)/i);
    if (matches && matches[1]) {
      return matches[1];
    }
  };

  /** @private */
  var numInstances = 0;

  return GoogleDrive;
})(H5P.jQuery);

// Register video handler (priority: before HTML5 fallback)
H5P.videoHandlers = H5P.videoHandlers || [];
H5P.videoHandlers.push(H5P.VideoGoogleDrive);
