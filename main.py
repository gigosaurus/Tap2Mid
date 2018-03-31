from flask import Flask, request, redirect, render_template, flash, send_file
from werkzeug.utils import secure_filename
import tempfile
import plistlib
from midiutil import MIDIFile

pitch_map = {60: 96, 62: 97, 64: 98}

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024 # 32 MB max
app.secret_key = 'ttr2_track_upload_secret_key'

@app.route('/ttr-track-convert')
def main():
  return render_template('index.html')

@app.route('/ttr-track-convert/upload', methods=['POST'])
def upload_file():
  # check if the post request has the file part
  if 'file' not in request.files:
    flash('No file part')
    return redirect('/ttr-track-convert')
  file = request.files['file']
  # if user does not select file, browser also
  # submit a empty part without filename
  if file.filename == '':
    flash('No selected file')
  if file and allowed_file(file.filename):
    pl = plistlib.readPlist(file)
    notes = parse_file(pl)
    filename = get_filename(pl)
    if notes is not None:
      print(notes[:10])
      mid = create_mid(notes)
      temp = tempfile.TemporaryFile()
      mid.writeFile(temp)
      temp.seek(0)
      return send_file(temp, mimetype='application/octet-stream', as_attachment=True, attachment_filename=filename)
    else:
      flash('Empty file')
  else:
    flash('Invalid file type')
  return redirect('/ttr-track-convert')


def allowed_file(filename):
  return '.' in filename and filename.rsplit('.', 1)[1].lower() == 'ttr2_track'

def parse_file(pl):
  notes = []
  size = len(pl['$objects'])
  for i in range(20, size - 6):
    note = pl['$objects'][i]
    if note['type'] == 1:
      # note end, lets find the matching note start
      found = False
      for n in reversed(notes):
        if n['pitch'] == note['note']:
          # found matching note start
          if n['duration'] == -1:
            n['duration'] = note['timeInQuarterNotes'] - n['time']
            found = True
            break
          else:
            # note start had already ended
            flash('Error 1')
            return None
      if not found:
        # no start for this note end
        flash('Error 2')
        return None
    else:
      # note start
      notes.append({'pitch': note['note'], 'time': note['timeInQuarterNotes'], 'duration': -1})

  for note in notes:
    if note['duration'] == -1:
      # a note started but never ended
      flash('Error 3')
      return None
    if note['pitch'] not in pitch_map:
      # unknown pitch
      flash('Error 4: Unknown pitch: ' + str(note['pitch']))
      return None
    note['pitch'] = pitch_map[note['pitch']]

  return notes

def create_mid(notes):
  mid = MIDIFile(1)
  mid.addTempo(0, 0, 120)
  for note in notes:
    mid.addNote(0, 0, note['pitch'], note['time'], note['duration'], 100)
  return mid

def get_filename(pl):
  song = pl['$objects'][4]
  artist = pl['$objects'][5]
  return secure_filename(artist) + "-" + secure_filename(song) + ".mid"
