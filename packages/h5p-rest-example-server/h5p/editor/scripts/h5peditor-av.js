/* global ns */
/**
 * Audio/Video module.
 * Makes it possible to add audio or video through file uploads and urls.
 *
 */
H5PEditor.widgets.video = H5PEditor.widgets.audio = H5PEditor.AV = (function ($) {

  // ===== Google Drive Picker — Popup approach (about:blank, no domain leak) =====
  var GDRIVE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
  var GDRIVE_APP_ID = 'YOUR_GOOGLE_APP_ID';

  // Store pending $urlField for postMessage callback
  var _gdrivePendingUrlField = null;

  // Listen for picked result from popup
  if (typeof window !== 'undefined') {
    window.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'gdrive-picked' && _gdrivePendingUrlField) {
        var driveUrl = 'https://drive.google.com/file/d/' + e.data.fileId + '/view';
        _gdrivePendingUrlField.val(driveUrl).trigger('change');
        _gdrivePendingUrlField = null;
      }
    });
  }

  /**
   * Open Google Drive Picker in a large about:blank popup.
   * - No domain leak (URL bar shows about:blank)
   * - No cross-origin iframe issues (popup is top-level)
   * - Large window for easy browsing
   *
   * @param {jQuery} $urlField
   */
  function openGoogleDrivePicker($urlField) {
    if (
      GDRIVE_CLIENT_ID.indexOf('YOUR_GOOGLE_') === 0 ||
      GDRIVE_APP_ID.indexOf('YOUR_GOOGLE_') === 0
    ) {
      alert('Google Drive Picker chưa được cấu hình. Hãy cập nhật GDRIVE_CLIENT_ID và GDRIVE_APP_ID trước khi dùng tính năng này.');
      return;
    }

    _gdrivePendingUrlField = $urlField;

    // Center popup on screen
    var w = Math.min(1100, screen.width - 100);
    var h = Math.min(720, screen.height - 100);
    var left = Math.round((screen.width - w) / 2);
    var top = Math.round((screen.height - h) / 2);

    var popup = window.open('', 'gdrive_picker',
      'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top +
      ',menubar=no,toolbar=no,location=no,status=no');

    if (!popup) {
      alert('Trình duyệt đã chặn popup. Vui lòng cho phép popup cho trang này.');
      _gdrivePendingUrlField = null;
      return;
    }

    var pickerHTML = [
      '<!DOCTYPE html>',
      '<html><head>',
      '<title>Chọn Video từ Google Drive</title>',
      '<style>',
      '*{margin:0;padding:0;box-sizing:border-box}',
      'body{font-family:"Google Sans",Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f8f9fa}',
      '.container{text-align:center;color:#5f6368}',
      '.spinner{width:48px;height:48px;border:4px solid #e0e0e0;border-top-color:#1a73e8;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 16px}',
      '@keyframes spin{to{transform:rotate(360deg)}}',
      'h2{font-size:18px;font-weight:400;margin:0 0 8px}',
      'p{font-size:13px;color:#80868b;margin:0 0 24px}',
      '.auth-btn{display:none;padding:14px 36px;font-size:16px;font-weight:500;color:#fff;background:#1a73e8;border:none;border-radius:8px;cursor:pointer;font-family:inherit;transition:background .2s,box-shadow .2s}',
      '.auth-btn:hover{background:#1557b0;box-shadow:0 2px 8px rgba(26,115,232,.3)}',
      '.gdrive-icon{width:24px;height:24px;vertical-align:middle;margin-right:8px}',
      '.picker-dialog-bg{z-index:1000!important}',
      '.picker-dialog{z-index:1001!important}',
      '</style>',
      '</head><body>',
      '<div class="container" id="container">',
      '<div class="spinner" id="spinner"></div>',
      '<h2 id="status">Đang tải Google Drive...</h2>',
      '<p id="sub">Vui lòng đợi trong giây lát</p>',
      '<button class="auth-btn" id="authBtn" onclick="doAuth()">',
      '<svg class="gdrive-icon" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-20.4 35.3c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 13.35z" fill="#ea4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-10.1-17.5c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 23.5h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>',
      'Đăng nhập Google Drive',
      '</button>',
      '</div>',
      '<script src="https://apis.google.com/js/api.js"></' + 'script>',
      '<script src="https://accounts.google.com/gsi/client"></' + 'script>',
      '<script>',
      'var CLIENT_ID="' + GDRIVE_CLIENT_ID + '";',
      'var APP_ID="' + GDRIVE_APP_ID + '";',
      'var gapiReady=false,gisReady=false,tokenClient;',
      '',
      'function onReady(){',
      '  if(gapiReady&&gisReady){',
      '    document.getElementById("spinner").style.display="none";',
      '    document.getElementById("status").textContent="Sẵn sàng!";',
      '    document.getElementById("sub").textContent="Bấm nút bên dưới để chọn video";',
      '    document.getElementById("authBtn").style.display="inline-block";',
      '  }',
      '}',
      '',
      'gapi.load("picker",function(){gapiReady=true;onReady();});',
      '',
      'tokenClient=google.accounts.oauth2.initTokenClient({',
      '  client_id:CLIENT_ID,',
      '  scope:"https://www.googleapis.com/auth/drive.readonly",',
      '  callback:function(r){',
      '    if(r.error){document.getElementById("status").textContent="Lỗi: "+r.error;return;}',
      '    showPicker(r.access_token);',
      '  }',
      '});',
      'gisReady=true;onReady();',
      '',
      'function doAuth(){',
      '  document.getElementById("authBtn").style.display="none";',
      '  document.getElementById("spinner").style.display="block";',
      '  document.getElementById("status").textContent="Đang xác thực...";',
      '  document.getElementById("sub").textContent="";',
      '  tokenClient.requestAccessToken({prompt:"consent"});',
      '}',
      '',
      'function showPicker(token){',
      '  var view=new google.picker.DocsView(google.picker.ViewId.DOCS);',
      '  view.setMimeTypes("video/mp4,video/webm,video/ogg,video/avi,video/mov,video/mkv,video/x-matroska,video/quicktime");',
      '  var picker=new google.picker.PickerBuilder()',
      '    .setOAuthToken(token)',
      '    .addView(view)',
      '    .addView(new google.picker.DocsUploadView())',
      '    .setAppId(APP_ID)',
      '    .setSize(window.innerWidth,window.innerHeight)',
      '    .setCallback(function(data){',
      '      if(data.action==="picked"){',
      '        window.opener.postMessage({type:"gdrive-picked",fileId:data.docs[0].id},"*");',
      '        window.close();',
      '      }',
      '      if(data.action==="cancel")window.close();',
      '    }).build();',
      '  document.getElementById("container").style.display="none";',
      '  picker.setVisible(true);',
      '}',
      '</' + 'script>',
      '</body></html>'
    ].join('\n');

    popup.document.write(pickerHTML);
    popup.document.close();
  }

  /**
   * Constructor.
   *
   * @param {mixed} parent
   * @param {object} field
   * @param {mixed} params
   * @param {function} setValue
   * @returns {_L3.C}
   */
  function C(parent, field, params, setValue) {
    var self = this;

    // Initialize inheritance
    H5PEditor.FileUploader.call(self, field);

    this.parent = parent;
    this.field = field;
    this.params = params;
    this.setValue = setValue;
    this.changes = [];

    if (params !== undefined && params[0] !== undefined) {
      this.setCopyright(params[0].copyright);
    }

    // When uploading starts
    self.on('upload', function () {
      // Insert throbber
      self.$uploading = $('<div class="h5peditor-uploading h5p-throbber">' + H5PEditor.t('core', 'uploading') + '</div>').insertAfter(self.$add.hide());

      // Clear old error messages
      self.$errors.html('');

      // Close dialog
      self.closeDialog();
    });

    // Monitor upload progress
    self.on('uploadProgress', function (e) {
      self.$uploading.html(H5PEditor.t('core', 'uploading') + ' ' + Math.round(e.data * 100) + ' %');
    });

    // Handle upload complete
    self.on('uploadComplete', function (event) {
      var result = event.data;

      // Clear out add dialog
      this.$addDialog.find('.h5p-file-url').val('');

      try {
        if (result.error) {
          throw result.error;
        }

        // Set params if none is set
        if (self.params === undefined) {
          self.params = [];
          self.setValue(self.field, self.params);
        }

        // Add a new file/source
        var file = {
          path: result.data.path,
          mime: result.data.mime,
          copyright: self.copyright
        };
        var index = (self.updateIndex !== undefined ? self.updateIndex : self.params.length);
        self.params[index] = file;
        self.addFile(index);

        // Trigger change callbacks (old event system)
        for (var i = 0; i < self.changes.length; i++) {
          self.changes[i](file);
        }
      }
      catch (error) {
        // Display errors
        self.$errors.append(H5PEditor.createError(error));
      }

      if (self.$uploading !== undefined && self.$uploading.length !== 0) {
        // Hide throbber and show add button
        self.$uploading.remove();
        self.$add.show();
      }
    });
  }

  C.prototype = Object.create(ns.FileUploader.prototype);
  C.prototype.constructor = C;

  /**
   * Append widget to given wrapper.
   *
   * @param {jQuery} $wrapper
   */
  C.prototype.appendTo = function ($wrapper) {
    var self = this;
    const id = ns.getNextFieldId(this.field);

    var imageHtml =
      '<ul class="file list-unstyled"></ul>' +
      (self.field.widgetExtensions ? C.createTabbedAdd(self.field.type, self.field.widgetExtensions, id, self.field.description !== undefined) : C.createAdd(self.field.type, id, self.field.description !== undefined))

    if (!this.field.disableCopyright) {
      imageHtml += '<a class="h5p-copyright-button" href="#">' + H5PEditor.t('core', 'editCopyright') + '</a>';
    }

    imageHtml += '<div class="h5p-editor-dialog">' +
      '<a href="#" class="h5p-close" title="' + H5PEditor.t('core', 'close') + '"></a>' +
      '</div>';

    var html = H5PEditor.createFieldMarkup(this.field, imageHtml, id);
    var $container = $(html).appendTo($wrapper);

    this.$files = $container.children('.file');
    this.$add = $container.children('.h5p-add-file').click(function () {
      self.$addDialog.addClass('h5p-open');
    });

    // Tabs that are hard-coded into this widget. Any other tab must be an extension.
    const TABS = {
      UPLOAD: 0,
      INPUT: 1
    };

    // The current active tab
    let activeTab = TABS.UPLOAD;

    /**
     * @param {number} tab
     * @return {boolean}
     */
    const isExtension = function (tab) {
      return tab > TABS.INPUT; // Always last tab
    };

    /**
     * Toggle the currently active tab.
     */
    const toggleTab = function () {
      // Pause the last active tab
      if (isExtension(activeTab)) {
        tabInstances[activeTab].pause();
      }

      // Update tab
      this.parentElement.querySelector('.selected').classList.remove('selected');
      this.classList.add('selected');

      // Update tab panel
      const el = document.getElementById(this.getAttribute('aria-controls'));
      el.parentElement.querySelector('.av-tabpanel:not([hidden])').setAttribute('hidden', '');
      el.removeAttribute('hidden');

      // Set active tab index
      for (let i = 0; i < el.parentElement.children.length; i++) {
        if (el.parentElement.children[i] === el) {
          activeTab = i - 1; // Compensate for .av-tablist in the same wrapper
          break;
        }
      }

      // Toggle insert button disabled
      if (activeTab === TABS.UPLOAD) {
        self.$insertButton[0].disabled = true;
      }
      else if (activeTab === TABS.INPUT) {
        self.$insertButton[0].disabled = false;
      }
      else {
        self.$insertButton[0].disabled = !tabInstances[activeTab].hasMedia();
      }
    }

    /**
     * Switch focus between the buttons in the tablist
     */
    const moveFocus = function (el) {
      if (el) {
        this.setAttribute('tabindex', '-1');
        el.setAttribute('tabindex', '0');
        el.focus();
      }
    }

    // Register event listeners to tab DOM elements
    $container.find('.av-tab').click(toggleTab).keydown(function (e) {
      if (e.which === 13 || e.which === 32) { // Enter or Space
        toggleTab.call(this, e);
        e.preventDefault();
      }
      else if (e.which === 37 || e.which === 38) { // Left or Up
        moveFocus.call(this, this.previousSibling);
        e.preventDefault();
      }
      else if (e.which === 39 || e.which === 40) { // Right or Down
        moveFocus.call(this, this.nextSibling);
        e.preventDefault();
      }
    });

    this.$addDialog = this.$add.next().children().first();

    // Prepare to add the extra tab instances
    const tabInstances = [null, null]; // Add nulls for hard-coded tabs
    self.tabInstances = tabInstances;

    if (self.field.widgetExtensions) {

      /**
       * @param {string} type Constructor name scoped inside this widget
       * @param {number} index
       */
      const createTabInstance = function (type, index) {
        const tabInstance = new H5PEditor.AV[type]();
        tabInstance.appendTo(self.$addDialog[0].children[0].children[index + 1]); // Compensate for .av-tablist in the same wrapper
        tabInstance.on('hasMedia', function (e) {
          if (index === activeTab) {
            self.$insertButton[0].disabled = !e.data;
          }
        });
        tabInstances.push(tabInstance);
      }

      // Append extra tabs
      for (let i = 0; i < self.field.widgetExtensions.length; i++) {
        if (H5PEditor.AV[self.field.widgetExtensions[i]]) {
          createTabInstance(self.field.widgetExtensions[i], i + 2); // Compensate for the number of hard-coded tabs
        }
      }
    }

    var $url = this.$url = this.$addDialog.find('.h5p-file-url');

    var $gDriveBtn = this.$addDialog.find('.h5p-gdrive-picker-btn');
    if ($gDriveBtn.length) {
      $gDriveBtn.click(function (e) {
        e.preventDefault();
        openGoogleDrivePicker($url);
      });
    }

    this.$addDialog.find('.h5p-cancel').click(function () {
      self.updateIndex = undefined;
      self.closeDialog();
    });

    this.$addDialog.find('.h5p-file-drop-upload')
      .addClass('has-advanced-upload')
      .on('drag dragstart dragend dragover dragenter dragleave drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
      })
      .on('dragover dragenter', function (e) {
        $(this).addClass('over');
        e.originalEvent.dataTransfer.dropEffect = 'copy';
      })
      .on('dragleave', function () {
        $(this).removeClass('over');
      })
      .on('drop', function (e) {
        self.uploadFiles(e.originalEvent.dataTransfer.files);
      })
      .click(function () {
        self.openFileSelector();
      });

    this.$insertButton = this.$addDialog.find('.h5p-insert').click(function () {
      if (isExtension(activeTab)) {
        const media = tabInstances[activeTab].getMedia();
        if (media) {
          self.upload(media.data, media.name);
        }
      }
      else {
        const url = $url.val().trim();
        if (url) {
          self.useUrl(url);
        }
      }

      self.closeDialog();
    });

    this.$errors = $container.children('.h5p-errors');

    if (this.params !== undefined) {
      for (var i = 0; i < this.params.length; i++) {
        this.addFile(i);
      }
    }
    else {
      $container.find('.h5p-copyright-button').addClass('hidden');
    }

    var $dialog = $container.find('.h5p-editor-dialog');
    $container.find('.h5p-copyright-button').add($dialog.find('.h5p-close')).click(function () {
      $dialog.toggleClass('h5p-open');
      return false;
    });

    ns.File.addCopyright(self, $dialog, function (field, value) {
      self.setCopyright(value);
    });

  };

  /**
   * Add file icon with actions.
   *
   * @param {Number} index
   */
  C.prototype.addFile = function (index) {
    var that = this;
    var fileHtml;
    var file = this.params[index];
    var rowInputId = 'h5p-av-' + C.getNextId();
    var defaultQualityName = H5PEditor.t('core', 'videoQualityDefaultLabel', { ':index': index + 1 });
    var qualityName = (file.metadata && file.metadata.qualityName) ? file.metadata.qualityName : defaultQualityName;

    // Check if source is provider (Vimeo, YouTube, Panopto)
    const isProvider = (file.path && C.findProvider(file.path)) ?? false;

    // Only allow single source if YouTube
    if (isProvider) {
      // Remove all other files except this one
      that.$files.children().each(function (i) {
        if (i !== that.updateIndex) {
          that.removeFileWithElement($(this));
        }
      });
      // Remove old element if updating
      that.$files.children().each(function () {
        $(this).remove();
      });
      // This is now the first and only file
      index = 0;
    }
    this.$add.toggleClass('hidden', isProvider);

    // If updating remove and recreate element
    if (that.updateIndex !== undefined) {
      var $oldFile = this.$files.children(':eq(' + index + ')');
      $oldFile.remove();
      this.updateIndex = undefined;
    }

    // Create file with customizable quality if enabled and not youtube
    if (this.field.enableCustomQualityLabel === true && !isProvider) {
      fileHtml = '<li class="h5p-av-row">' +
        '<div class="h5p-thumbnail">' +
        '<div class="h5p-type" title="' + file.mime + '">' + file.mime.split('/')[1] + '</div>' +
        '<div role="button" tabindex="0" class="h5p-remove" title="' + H5PEditor.t('core', 'removeFile') + '">' +
        '</div>' +
        '</div>' +
        '<div class="h5p-video-quality">' +
        '<div class="h5p-video-quality-title">' + H5PEditor.t('core', 'videoQuality') + '</div>' +
        '<label class="h5peditor-field-description" for="' + rowInputId + '">' + H5PEditor.t('core', 'videoQualityDescription') + '</label>' +
        '<input id="' + rowInputId + '" class="h5peditor-text" type="text" maxlength="60" value="' + qualityName + '">' +
        '</div>' +
        '</li>';
    }
    else {
      fileHtml = '<li class="h5p-av-cell">' +
        '<div class="h5p-thumbnail">' +
        '<div class="h5p-type" title="' + file.mime + '">' + file.mime.split('/')[1] + '</div>' +
        '<div role="button" tabindex="0" class="h5p-remove" title="' + H5PEditor.t('core', 'removeFile') + '">' +
        '</div>' +
        '</li>';
    }

    // Insert file element in appropriate order
    var $file = $(fileHtml);
    if (index >= that.$files.children().length) {
      $file.appendTo(that.$files);
    }
    else {
      $file.insertBefore(that.$files.children().eq(index));
    }

    this.$add.parent().find('.h5p-copyright-button').removeClass('hidden');

    // Handle thumbnail click
    $file
      .children('.h5p-thumbnail')
      .click(function () {
        if (!that.$add.is(':visible')) {
          return; // Do not allow editing of file while uploading
        }
        that.$addDialog.addClass('h5p-open').find('.h5p-file-url').val(that.params[index].path);
        that.updateIndex = index;
      });

    // Handle remove button click
    $file
      .find('.h5p-remove')
      .click(function () {
        if (that.$add.is(':visible')) {
          confirmRemovalDialog.show($file.offset().top);
        }

        return false;
      });

    // on input update
    $file
      .find('input')
      .change(function () {
        file.metadata = { qualityName: $(this).val() };
      });

    // Create remove file dialog
    var confirmRemovalDialog = new H5P.ConfirmationDialog({
      headerText: H5PEditor.t('core', 'removeFile'),
      dialogText: H5PEditor.t('core', 'confirmRemoval', { ':type': 'file' })
    }).appendTo(document.body);

    // Remove file on confirmation
    confirmRemovalDialog.on('confirmed', function () {
      that.removeFileWithElement($file);
      if (that.$files.children().length === 0) {
        that.$add.parent().find('.h5p-copyright-button').addClass('hidden');
      }
    });
  };

  /**
   * Remove file at index
   *
   * @param {number} $file File element
   */
  C.prototype.removeFileWithElement = function ($file) {
    var index = $file.index();

    // Remove from params.
    if (this.params.length === 1) {
      delete this.params;
      this.setValue(this.field);
    }
    else {
      this.params.splice(index, 1);
    }

    $file.remove();
    this.$add.removeClass('hidden');

    // Notify change listeners
    for (var i = 0; i < this.changes.length; i++) {
      this.changes[i]();
    }
  };

  C.prototype.useUrl = function (url) {
    if (this.params === undefined) {
      this.params = [];
      this.setValue(this.field, this.params);
    }

    var mime;
    var aspectRatio;
    var i;
    var matches = url.match(/\.(webm|mp4|ogv|m4a|mp3|ogg|oga|wav)/i);
    if (matches !== null) {
      mime = matches[matches.length - 1];
    }
    else {
      // Try to find a provider
      const provider = C.findProvider(url);
      if (provider) {
        mime = provider.name;
        aspectRatio = provider.aspectRatio;
      }
    }

    var file = {
      path: url,
      mime: this.field.type + '/' + (mime ? mime : 'unknown'),
      copyright: this.copyright,
      aspectRatio: aspectRatio ? aspectRatio : undefined,
    };
    var index = (this.updateIndex !== undefined ? this.updateIndex : this.params.length);
    this.params[index] = file;
    this.addFile(index);

    for (i = 0; i < this.changes.length; i++) {
      this.changes[i](file);
    }
  };

  /**
   * Validate the field/widget.
   *
   * @returns {Boolean}
   */
  C.prototype.validate = function () {
    return true;
  };

  /**
   * Remove this field/widget.
   */
  C.prototype.remove = function () {
    this.$errors.parent().remove();
  };

  /**
   * Sync copyright between all video files.
   *
   * @returns {undefined}
   */
  C.prototype.setCopyright = function (value) {
    this.copyright = value;
    if (this.params !== undefined) {
      for (var i = 0; i < this.params.length; i++) {
        this.params[i].copyright = value;
      }
    }
  };

  /**
   * Collect functions to execute once the tree is complete.
   *
   * @param {function} ready
   * @returns {undefined}
   */
  C.prototype.ready = function (ready) {
    if (this.passReadies) {
      this.parent.ready(ready);
    }
    else {
      ready();
    }
  };

  /**
   * Close the add media dialog
   */
  C.prototype.closeDialog = function () {
    this.$addDialog.removeClass('h5p-open');

    // Reset URL input
    this.$url.val('');

    // Reset all of the tabs
    for (let i = 0; i < this.tabInstances.length; i++) {
      if (this.tabInstances[i]) {
        this.tabInstances[i].reset();
      }
    }
  };

  /**
   * Create the HTML for the dialog itself.
   *
   * @param {string} content HTML
   * @param {boolean} disableInsert
   * @param {string} id
   * @param {boolean} hasDescription
   * @returns {string} HTML
   */
  C.createInsertDialog = function (content, disableInsert, id, hasDescription) {
    return '<div role="button" tabindex="0" id="' + id + '"' + (hasDescription ? ' aria-describedby="' + ns.getDescriptionId(id) + '"' : '') + ' class="h5p-add-file" title="' + H5PEditor.t('core', 'addFile') + '"></div>' +
      '<div class="h5p-dialog-anchor"><div class="h5p-add-dialog">' +
      '<div class="h5p-add-dialog-table">' + content + '</div>' +
      '<div class="h5p-buttons">' +
      '<button class="h5peditor-button-textual h5p-insert"' + (disableInsert ? ' disabled' : '') + '>' + H5PEditor.t('core', 'insert') + '</button>' +
      '<button class="h5peditor-button-textual h5p-cancel">' + H5PEditor.t('core', 'cancel') + '</button>' +
      '</div>' +
      '</div></div>';
  };

  /**
   * Creates the HTML needed for the given tab.
   *
   * @param {string} tab Tab Identifier
   * @param {string} type 'video' or 'audio'
   * @returns {string} HTML
   */
  C.createTabContent = function (tab, type) {
    const isAudio = (type === 'audio');

    switch (tab) {
      case 'BasicFileUpload':
        const id = 'av-upload-' + C.getNextId();
        return '<h3 id="' + id + '">' + H5PEditor.t('core', isAudio ? 'uploadAudioTitle' : 'uploadVideoTitle') + '</h3>' +
          '<div class="h5p-file-drop-upload" tabindex="0" role="button" aria-labelledby="' + id + '">' +
          '<div class="h5p-file-drop-upload-inner ' + type + '"></div>' +
          '</div>';

      case 'InputLinkURL':
        return '<h3>' + H5PEditor.t('core', isAudio ? 'enterAudioTitle' : 'enterVideoTitle') + '</h3>' +
          '<div class="h5p-file-url-wrapper ' + type + '">' +
          '<input type="text" placeholder="' + H5PEditor.t('core', isAudio ? 'enterAudioUrl' : 'enterVideoUrl') + '" class="h5p-file-url h5peditor-text"/>' +
          '</div>' +
          (isAudio ? '' : '<button type="button" class="h5p-gdrive-picker-btn" style="margin-top: 10px; display: inline-block; padding: 0.5em 1em; cursor: pointer; border: 1px solid #dadce0; border-radius: 4px; background: #fff; color: #1a73e8; font-family: sans-serif; font-size: 14px; font-weight: normal;"><svg style="vertical-align: text-bottom; margin-right: 6px;" viewBox="0 0 512 512" width="16" height="16"><path fill="#FFC107" d="M170.6,341.3h170.7L256,482.1L170.6,341.3z"/><path fill="#1976D2" d="M341.3,341.3l85.3-140.8l85.3,140.8H341.3z"/><path fill="#4CAF50" d="M170.6,341.3l85.3-140.8L170.6,59.7L0,341.3H170.6z"/></svg>Chọn Video từ Google Drive</button>') +
          (isAudio ? '' : '<div class="h5p-errors"></div><div class="h5peditor-field-description">' + H5PEditor.t('core', 'addVideoDescription') + '</div>');

      default:
        return '';
    }
  };

  /**
   * Creates the HTML for the tabbed insert media dialog. Only used when there
   * are extra tabs.
   *
   * @param {string} type 'video' or 'audio'
   * @param {Array} extraTabs
   * @returns {string} HTML
   */
  C.createTabbedAdd = function (type, extraTabs, id, hasDescription) {
    let i;

    const tabs = [
      'BasicFileUpload',
      'InputLinkURL'
    ];
    for (i = 0; i < extraTabs.length; i++) {
      tabs.push(extraTabs[i]);
    }

    let tabsHTML = '';
    let tabpanelsHTML = '';

    for (i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const tabId = C.getNextId();
      const tabindex = (i === 0 ? 0 : -1)
      const selected = (i === 0 ? 'true' : 'false');
      const title = (i > 1 ? H5PEditor.t('H5PEditor.' + tab, 'title') : H5PEditor.t('core', 'tabTitle' + tab));

      tabsHTML += '<div class="av-tab' + (i === 0 ? ' selected' : '') + '" tabindex="' + tabindex + '" role="tab" aria-selected="' + selected + '" aria-controls="av-tabpanel-' + tabId + '" id="av-tab-' + tabId + '">' + title + '</div>';
      tabpanelsHTML += '<div class="av-tabpanel" tabindex="-1" role="tabpanel" id="av-tabpanel-' + tabId + '" aria-labelledby="av-tab-' + tabId + '"' + (i === 0 ? '' : ' hidden=""') + '>' + C.createTabContent(tab, type) + '</div>';
    }

    return C.createInsertDialog(
      '<div class="av-tablist" role="tablist" aria-label="' + H5PEditor.t('core', 'avTablistLabel') + '">' + tabsHTML + '</div>' + tabpanelsHTML,
      true, id, hasDescription
    );
  };

  /**
   * Creates the HTML for the basic 'Upload or URL' dialog.
   *
   * @param {string} type 'video' or 'audio'
   * @param {string} id
   * @param {boolean} hasDescription
   * @returns {string} HTML
   */
  C.createAdd = function (type, id, hasDescription) {
    return C.createInsertDialog(
      '<div class="h5p-dialog-box">' +
      C.createTabContent('BasicFileUpload', type) +
      '</div>' +
      '<div class="h5p-or-vertical">' +
      '<div class="h5p-or-vertical-line"></div>' +
      '<div class="h5p-or-vertical-word-wrapper">' +
      '<div class="h5p-or-vertical-word">' + H5PEditor.t('core', 'or') + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="h5p-dialog-box">' +
      C.createTabContent('InputLinkURL', type) +
      '</div>',
      false, id, hasDescription
    );
  };

  /**
   * Providers incase mime type is unknown.
   * @public
   */
  C.providers = [
    {
      name: 'YouTube',
      regexp: /(?:https?:\/\/)?(?:www\.)?(?:(?:youtube.com\/(?:attribution_link\?(?:\S+))?(?:v\/|embed\/|watch\/|(?:user\/(?:\S+)\/)?watch(?:\S+)v\=))|(?:youtu.be\/|y2u.be\/))([A-Za-z0-9_-]{11})/i,
      aspectRatio: '16:9',
    },
    {
      name: 'Panopto',
      regexp: /^[^\/]+:\/\/([^\/]*panopto\.[^\/]+)\/Panopto\/.+\?id=(.+)$/i,
      aspectRatio: '16:9',
    },
    {
      name: 'Vimeo',
      regexp: /^.*(vimeo\.com\/)((channels\/[A-z]+\/)|(groups\/[A-z]+\/videos\/))?([0-9]+)/,
      aspectRatio: '16:9',
    },
    {
      name: 'Echo360',
      regexp: /^[^\/]+:\/\/(echo360[^\/]+)\/media\/([^\/]+)\/h5p.*$/i,
      aspectRatio: '16:9',
    },
  ];

  /**
   * Find & return an external provider based on the URL
   *
   * @param {string} url
   * @returns {Object}
   */
  C.findProvider = function (url) {
    for (i = 0; i < C.providers.length; i++) {
      if (C.providers[i].regexp.test(url)) {
        return C.providers[i];
      }
    }
  };

  // Avoid ID attribute collisions
  let idCounter = 0;

  /**
   * Grab the next available ID to avoid collisions on the page.
   * @public
   */
  C.getNextId = function () {
    return idCounter++;
  };

  return C;
})(H5P.jQuery);
