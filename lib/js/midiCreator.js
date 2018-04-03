class GenericEvent {
  constructor(tick, insertionOrder) {
    this.secSortOrder = 0;
    this.tick = tick;
    this.insertionOrder = insertionOrder || 0;
  }
}

class NoteOn extends GenericEvent {
  constructor(channel, pitch, tick, duration, volume, insertionOrder) {
    super(tick, insertionOrder);
    this.evtname = "NoteOn";
    this.midiStatus = 0x90;
    this.secSortOrder = 3;
    this.pitch = pitch;
    this.duration = duration;
    this.volume = volume;
    this.channel = channel;
  }

  serialize(previousEventTick) {
    var midibytes = [];
    var code = this.midiStatus | this.channel;
    var varTime = writeVarLength(this.tick - previousEventTick);
    midibytes = midibytes.concat(varTime);
    midibytes.push(code);
    midibytes.push(this.pitch);
    midibytes.push(this.volume);
    return midibytes
  }

}

class NoteOff extends GenericEvent {

  constructor(channel, pitch, tick, volume, insertionOrder) {
    super(tick, insertionOrder);
    this.evtname = "NoteOff";
    this.midiStatus = 0x80;
    this.secSortOrder = 2;
    this.pitch = pitch;
    this.volume = volume;
    this.channel = channel;
  }

  serialize(previousEventTick) {
    var midibytes = [];
    var code = this.midiStatus | this.channel;
    var varTime = writeVarLength(this.tick - previousEventTick);
    midibytes = midibytes.concat(varTime);
    midibytes.push(code);
    midibytes.push(this.pitch);
    midibytes.push(this.volume);
    return midibytes
  }
  
}

class Tempo extends GenericEvent {
  constructor(tick, tempo, insertionOrder) {
    super(tick, insertionOrder);
    this.evtname = "Tempo";
    this.secSortOrder = 3;
    this.tempo = Math.floor(60000000 / tempo);
  }

  serialize(previousEventTick) {
    var midibytes = [];
    var varTime = writeVarLength(this.tick - previousEventTick);
    midibytes = midibytes.concat(varTime);
    midibytes.push(0xFF);
    midibytes.push(0x51);
    midibytes.push(0x03);
    midibytes.push((this.tempo & 0xff0000) >> 16);
    midibytes.push((this.tempo & 0xff00) >> 8);
    midibytes.push(this.tempo & 0xff);
    return midibytes
  }
}

class MIDITrack {
  constructor(deinterleave) {
    this.headerString = [0x4D, 0x54, 0x72, 0x6B];
    this.dataLength = 0; // Is calculated after the data is in place
    this.midiData = [];
    this.closed = false;
    this.eventList = [];
    this.midiEventList = [];
    this.deinterleave = deinterleave;
  }

  addNoteByNumber(channel, pitch, tick, duration, volume, insertionOrder) {
    this.eventList.push(new NoteOn(channel, pitch, tick, duration, volume, insertionOrder));
    this.eventList.push(new NoteOff(channel, pitch, tick + duration, volume, insertionOrder));
  }

  addTempo(tick, tempo, insertionOrder) {
    this.eventList.push(new Tempo(tick, tempo, insertionOrder));
  }

  processEventList() {
    this.midiEventList = this.eventList.slice();
    this.midiEventList.sort(compareEvents);

    if (this.deinterleave) {
      this.deInterleaveNotes();
    }
  }

  closeTrack() {
    if (this.closed) return;
    this.closed = true;

    this.processEventList();
  }

  writeMidiStream() {
    this.writeEventsToStream();
    this.midiData.push(0x00);
    this.midiData.push(0xFF);
    this.midiData.push(0x2F);
    this.midiData.push(0x00);
    this.dataLength = [(this.midiData.length & 0xff000000) >> 24, 
                       (this.midiData.length & 0xff0000) >> 16,
                       (this.midiData.length & 0xff00) >> 8, 
                        this.midiData.length & 0xff];
  }

  writeEventsToStream() {
    var previousEventTick = 0;
    for (var i = 0; i < this.midiEventList.length; i++) {
      var temp = this.midiEventList[i].serialize(previousEventTick);
      this.midiData = this.midiData.concat(temp);
    }
  }

  deInterleaveNotes() {
    var tempEventList = [];
    var stack = {};

    for (var i = 0; i < this.midiEventList.length; i++) {
      var event = this.midiEventList[i];
      if (event.evtname === "NoteOn" || event.evtname === "NoteOff") {
        var noteeventkey = event.pitch + "" + event.channel;
        if (event.evtname == "NoteOn") {
          if (stack.hasOwnProperty(noteeventkey)) {
            stack[noteeventkey].push(event.tick);
          } else {
            stack[noteeventkey] = [event.tick];
          }
          tempEventList.push(event);
        } else {
          if (stack[noteeventkey].length > 1) {
            event.tick = stack[noteeventkey].pop();
            tempEventList.push(event);
          } else {
            stack[noteeventkey].pop();
            tempEventList.push(event);
          }
        }
      } else {
        tempEventList.push(event);
      }
    }

    this.midiEventList = tempEventList;
    this.midiEventList.compare(compareEvents);
  }

  adjustTimeAndOrigin(origin, adjust) {
    if (this.midiEventList.length == 0) return;

    var tempEventList = [];
    var internalOrigin = adjust ? origin : 0;
    var runningTick = 0;

    for (var i = 0; i < this.midiEventList.length; i++) {
      var event = this.midiEventList[i];
      var adjustedTick = event.tick - internalOrigin;
      event.tick = adjustedTick - runningTick;
      runningTick = adjustedTick;
      tempEventList.push(event);
    }

    this.midiEventList = tempEventList;
  }

  writeTrack(file) {
    file = file.concat(this.headerString);
    file = file.concat(this.dataLength);
    file = file.concat(this.midiData);
    return file;
  }
}

class MIDIHeader {
  constructor(numTracks, fileFormat, ticksPerQuarternote) {
    this.headerString = [0x4D, 0x54, 0x68, 0x64];
    this.headerSize = [0x00, 0x00, 0x00, 0x06];
    this.formatnum = [0x00, fileFormat]; // only 0, 1, 2 is valid
    this.numericFormat = fileFormat;
    this.numTracks = [(numTracks & 0xff00) >> 8, numTracks & 0xff];
    this.ticksPerQuarternote = [(ticksPerQuarternote & 0xff00) >> 8, ticksPerQuarternote & 0xff];
  }

  writeFile(file) {
    file = file || [];
    file = file.concat(this.headerString);
    file = file.concat(this.headerSize);
    file = file.concat(this.formatnum);
    file = file.concat(this.numTracks);
    file = file.concat(this.ticksPerQuarternote);
    return file;
  }
}

class MIDIFile {
  constructor(numTracks, deinterleave, adjustOrigin, fileFormat, ticksPerQuarternote) {
    this.tracks = [];
    if (fileFormat == 1) {
      this.numTracks = numTracks + 1;
    } else {
      this.numTracks = numTracks;
    }

    this.ticksPerQuarternote = ticksPerQuarternote || 960;

    this.header = new MIDIHeader(this.numTracks, fileFormat, this.ticksPerQuarternote);

    this.adjustOrigin = adjustOrigin || false;
    this.closed = false;

    for (var i = 0; i < this.numTracks; i++) {
      this.tracks.push(new MIDITrack(deinterleave));
    }

    this.eventCounter = 0;
    
  }

  timeToTicks(quarterNoteTime) {
    return Math.floor(quarterNoteTime * this.ticksPerQuarternote);
  }

  tickToQuarter(ticknum) {
    return ticknum / this.ticksPerQuarternote;
  }

  addNote(track, channel, pitch, time, duration, volume, annotation) {
    if (this.header.numericFormat == 1) {
      track += 1;
    }

    this.tracks[track].addNoteByNumber(channel, pitch, this.timeToTicks(time), this.timeToTicks(duration), volume, this.eventCounter);
    this.eventCounter += 1;
  }

  addTempo(track, time, tempo) {
    if (this.header.numericFormat == 1) {
      track = 0;
    }

    this.tracks[track].addTempo(this.timeToTicks(time), tempo, this.eventCounter);
    this.eventCounter += 1;
  }

  writeFile(file) {
    file = this.header.writeFile(file);
    this.close();

    for (var i = 0; i < this.numTracks; i++) {
      file = this.tracks[i].writeTrack(file);
    }

    return file;
  }

  close() {
    if (this.closed) return;

    for (var i = 0; i < this.numTracks; i++) {
      this.tracks[i].closeTrack();
      this.tracks[i].midiEventList.sort(compareEvents);
    }

    var origin = this.findOrigin();

    for (var i = 0; i < this.numTracks; i++) {
      this.tracks[i].adjustTimeAndOrigin(origin, this.adjustOrigin);
      this.tracks[i].writeMidiStream();
    }

    this.closed = true;
  }

  findOrigin() {
    var origin = 0;

    for (var i = 0; i < this.tracks.length; i++) {
      var track = this.tracks[i];
      if (track.midiEventList.length > 0) {
        if (track.midiEventList[0].tick < origin || i == 0) {
          origin = track.midiEventList[0].tick;
        }
      }
    }

    return origin;
  }
}

function writeVarLength(i) {
  if (i == 0) return [0];

  var vlbytes = [];
  var hibit = 0x00;  // low-order byte has high bit cleared.
  while (i > 0) {
    vlbytes.push(((i & 0x7f) | hibit) & 0xff);
    i >>= 7;
    hibit = 0x80;
  }
  vlbytes.reverse(); // put most-significant byte first, least significant last
  return vlbytes;
}

function compareEvents(e1, e2) {
  if (e1.tick < e2.tick) return -1;
  if (e1.tick > e2.tick) return 1;
  if (e1.secSortOrder < e2.secSortOrder) return -1;
  if (e1.secSortOrder > e2.secSortOrder) return 1;
  if (e1.insertionOrder < e2.insertionOrder) return -1;
  if (e1.insertionOrder > e2.insertionOrder) return 1;
  return 0;
}
