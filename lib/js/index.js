var uploading = false;
var player;
var notes = [];
var offset = 0;
var current = 0;
var timerId = 0;
var approach = 1;
var pitches = {60: 96, 62: 97, 64: 98};
var lanes = {
  96: {y: 25, head: "red", tail: "pink"},
  97: {y: 100, head: "green", tail: "lime"},
  98: {y: 175, head: "blue", tail: "cyan"}
}

function init() {
  // Load the IFrame Player API code asynchronously.
  var tag = document.createElement('script');
  tag.src = "https://www.youtube.com/player_api";
  var firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

  // upload screen
  document.getElementById("fileselect").addEventListener("change", fileSelectHandler, false);
  
  var drag = document.getElementById("filedrop");
  drag.addEventListener("dragenter", fileDragHandler, false);
  drag.addEventListener("dragleave", fileDragHandler, false);

  // ytlink screen
  document.getElementById("btn-toUpload").onclick = function() {
    document.getElementById("upload").classList.remove("complete");
    document.getElementById("yturl").classList.add("hidden");

    document.getElementById("fileselect").value = "";
    document.getElementById("fileprogress").style.width = "0%";
  }

  var link = document.getElementById("ytlink");
  link.addEventListener("keypress", function(e) {
    var url = this.value + "" + String.fromCharCode(e.charCode);
    var id = getYtId(url);
    if (id != null && id.length == 11) {
      loadYtVid(id);
    }
  }, false);

  link.addEventListener("paste", function(e) {
    e.preventDefault();
    e.stopPropagation();
    var clipboard = e.clipboardData || window.clipboardData;
    var pasted = clipboard.getData("Text");
    var id = getYtId(pasted);
    if (id != null && id.length == 11) {
      loadYtVid(id);
    }
  }, false);

  // sync screen
  document.getElementById("btn-toYturl").onclick = function() {
    document.getElementById("yturl").classList.remove("complete");
    document.getElementById("sync").classList.add("hidden");

    //document.getElementById("ytlink").focus();
  }
  
  
  var c = document.getElementById("midvis");
  c.width = window.innerWidth;
/*  c.addEventListener("mousedown", function(e) {console.log(e);}, false);
  c.addEventListener("mouseup", function(e) {console.log(e);}, false);
  c.addEventListener("mousemove", function(e) {console.log(e);}, false);
  c.addEventListener("wheel", function(e) {console.log(e);}, false);
  c.addEventListener("mouseleave", function(e) {console.log(e);}, false);
*/
  var o = document.getElementById("offset");
  o.addEventListener("change", adjustOffset, false);
  o.addEventListener("keypress", function(e) {
    adjustOffset(e);
  }, false);

  o.addEventListener("paste", function(e) {
    e.preventDefault();
  }, false);

  // speed change
  var s = document.getElementById("speed");
  s.addEventListener("change", speedChange, false);

  // approach change
  var a = document.getElementById("approach");
  a.addEventListener("change", adjustApproach, false);

  /*a.onkeypress = function(e) {
    if (isNaN(this.value + "" + String.fromCharCode(e.charCode))) {
      return false;
    }
  }*/
  a.addEventListener("paste", function(e) {
    e.preventDefault();
  }, false);

  // convert button
  document.getElementById("convert").onclick = finishConvert;
}

// player has loaded
function onYouTubeIframeAPIReady() {
  document.getElementById("loading").remove();
  error("This is still under development.");
}

function error(str) {
  var errors = document.getElementById("errors");
  var error = document.createElement("p");
  error.appendChild(document.createTextNode(str));
  errors.appendChild(error);
  errors.style.display = "inline";
  setTimeout(function() {
    errors.removeChild(error);
    if (errors.children.length == 0) {
      errors.style.display = "none";
    }
  }, 5000);
}

function fileDragHandler(e) {
  var name = e.type == "dragenter" ? "hover" : "";
  document.getElementById("filedrop").className = name;
  var prog = document.getElementById("fileprogress");
  if (prog.className == "failed" && name == "hover") {
    prog.style.width = "0%";
  }
  prog.className = name;
}

// process file
function fileSelectHandler(e) {
  fileDragHandler(e);
  var files = e.target.files || e.dataTransfer.files;
  if (files.length > 1 || uploading) {
    error("Already processing a file, please wait!");
  } else if (files.length == 0) {
    error("No file selected!");
  } else {
    uploading = true;
    var file = files[0];
    var reader = new FileReader();
    var progress = document.getElementById("fileprogress");
    progress.className = "";
    reader.onload = function(event) {
      progress.style.width = "100%";
      if (!parseFile(event.target.result)) {
        progress.className = "failed";
      }
      uploading = false;
    }

    reader.onprogress = function(event) {
      var pc = parseInt((event.loaded / event.total * 100));
      progress.style.width = pc + "%";
    }

    reader.readAsText(file);
  }
}

function parseFile(file) {
  var data = new PListParser().parse(file);
  if (data == null) {
    return false;
  }

  try {
    parseTap(data);
  } catch (err) {
    error("ttr2_track process error: " + err);
    return false;
  }

  // hide upload screen
  document.getElementById("upload").classList.add("complete");
  document.getElementById("yturl").classList.remove("hidden");
  //document.getElementById("ytlink").focus();

  return true;
}

function parseTap(plist) {
  notes = [];
  var size = plist["$objects"].length;
  for (var i = 20; i < size - 6; i++) {
    var note = plist["$objects"][i];
    if (note.type === 1) {
      // note end, lets find the matching note start
      var found = false;
      for (var j = notes.length - 1; j >= 0; j--) {
        var n = notes[j];
        if (n.pitch === note.note) {
          // found matching note start
          if (n.length === -1) {
            n.length = note.time - n.start;
            found = true;
            break;
          } else {
            throw "No matching note start for note " + j;
          }
        }
      }

      if (!found) {
        throw "No previous note start for note " + i;
      }
    } else {
      notes.push({pitch: note.note, start: note.time, length: -1});
    }
  }

  for (var i = 0; i < notes.length; i++) {
    var note = notes[i];
    if (note.length === -1) {
      throw "No matching note end for note " + i;
    }

    if (pitches.hasOwnProperty(note.pitch)) {
      note.pitch = pitches[note.pitch];
    } else {
      throw "Unsupported pitch: " + note.pitch;
    }
  }
}

// obtain ID from url
function getYtId(url) {
  var regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  var match = url.match(regExp);
  if (match && match[2].length == 11) {
    return match[2];
  } else {
    return null;
  }
}

// attempt to load vid from url provided
function loadYtVid(id) {
  console.log("loading vid: " + id);
  player = new YT.Player('ytplayer', {
    height: '180',
    width: '320',
    videoId: id,
    playerVars: {
      enablejsapi: '1',
      rel: '0',
      showinfo: '0'
    },
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange
    }
  });
}

// valid url, show the sync screen
function onPlayerReady(event) {
  document.getElementById("yturl").classList.add("complete");
  document.getElementById("sync").classList.remove("hidden");

  drawCanvas();
}

// yt vid play/stop
function onPlayerStateChange(event) {
  if (event.data == YT.PlayerState.PLAYING) {
    if (timerId != 0) {
      clearInterval(timerId);
    }
    timerId = setInterval(function() {
      current = player.getCurrentTime();
      drawCanvas();
    }, 20);    
  } else if (event.data != YT.PlayerState.CUED) {
    clearInterval(timerId);
    timerId = 0;
    drawCanvas();
  }
}

// approach speed change
function adjustApproach(e) {
  approach = parseFloat(e.target.value);
  if (timerId == 0) {
    drawCanvas();
  }
}

// vid playback rate change
function speedChange(e) {
  player.setPlaybackRate(parseFloat(e.target.value));
}

// offset change
function adjustOffset(e) {
  offset = parseFloat(e.target.value);
  if (timerId == 0) {
    drawCanvas();
  }
}

function drawCanvas() {
  // canvas displays a total of 5 seconds
  var behind = -0.5 * (1 / approach);
  var end = 4.5 * (1 / approach);
  var cLength = end - behind;
  var radius = 25;

  // get and clear canvas
  var c = document.getElementById("midvis");
  var ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  
  // draw current time line
  var cX = c.width / 10;
  ctx.moveTo(cX, 0);
  ctx.lineTo(cX, c.height);
  ctx.stroke();

  var cStart = current - offset + behind;
  var cEnd = current - offset + end;

  // draw all the notes that are on the screen
  for (var i = 0; i < notes.length; i++) {
    var note = notes[i];
    var length = note.length > 0.25 ? note.length * c.width / cLength : 0;
    var y = lanes[note.pitch].y + radius;

    // don't display if start and end of note are both off the same side
    if (!(note.start < cStart && note.start + note.length < cStart) // note hasn't passed
        && !(note.start > cEnd && note.start + note.length > cEnd)) { // note has arrived
      drawNote(ctx, radius, lanes[note.pitch], (note.start - cStart) * c.width / cLength, length);
    }
  }

  ctx.beginPath();
}

function drawNote(ctx, radius, lane, start, length) {

  // draw the tail of the note
  if (length > 0) {
    ctx.beginPath();
    ctx.fillStyle = lane.tail;
    ctx.fillRect(start, lane.y, length - radius, radius * 2);
    ctx.arc(start + length - radius, lane.y + radius, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // draw the head of the note
  ctx.beginPath();
  ctx.fillStyle = lane.head;
  ctx.arc(start, lane.y + radius, radius, 0, Math.PI * 2);
  ctx.fill();
}

function finishConvert() {
  var midi = new MIDIFile(1);
  midi.addTempo(0, 0, 60);

  for (var i = 0; i < notes.length; i++) {
    var note = notes[i];
    midi.addNote(0, 0, note.pitch, (note.start + offset) * 2, note.length * 2, 100);
  }

  var data = new Uint8Array(midi.writeFile());
  var blob = new Blob([data], {type: "application/octet-stream"});

  var e = document.createElement('a');
  e.style.display = "none";
  e.setAttribute('href', URL.createObjectURL(blob));

  var name = player.getVideoData().title.replace(/ /g, '_').replace(/[^a-z0-9_\-]/gi, '');
  e.setAttribute('download', name + ".mid");
  e.click();
}

// now we've got that all out of the way, lets start this thing
init();
