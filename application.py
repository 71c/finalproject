import os
import requests
import time, re

from flask import Flask, jsonify, render_template, request
from flask import send_file
from flask_socketio import SocketIO, emit

from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker

from PIL import Image

from threading import Timer

width, height = 3000, 3000

chunk_size = 512

last_pixel_change_time = time.time()
counter = 0
pixel_changes = []

image_name = 'image11.png'



try:
  image = Image.open(image_name)
except:
  image = Image.new('RGBA', (width, height), color=(34, 34, 34, 255))
  image.save(image_name)

app = Flask(__name__)
socketio = SocketIO(app)

# Check for environment variable
if not os.getenv("DATABASE_URL"):
    raise RuntimeError("DATABASE_URL is not set")

# Configure session to use filesystem
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_TYPE"] = "filesystem"

engine = create_engine(os.getenv("DATABASE_URL"))
db = scoped_session(sessionmaker(bind=engine))

def set_interval(func, sec):
    def func_wrapper():
        set_interval(func, sec)
        func()
    t = Timer(sec, func_wrapper)
    t.start()
    return t

def update_user_count():
  db.execute("UPDATE users SET logged_in = FALSE WHERE 'now' - last_accessed_time > interval '00:15:00'")
  db.commit()
  print('hi')

def commit_pixel_changes():
  global pixel_changes
  global last_pixel_change_time
  global counter
  if len(pixel_changes) > 0:
    print('wifjsojf')
    emit('broadcast change pixels', {'pixel_changes': pixel_changes}, broadcast=True)
    for change in pixel_changes:
      image.putpixel((change['x'], change['y']), change['color'])
    image.save(image_name)
    pixel_changes = []
    counter = 0

update_user_count()
set_interval(update_user_count, 900)

commit_pixel_changes()

def user_count():
  return db.execute("SELECT * FROM users WHERE logged_in").rowcount

def send_user_count():
  emit('send user count', {'user_count': user_count()}, broadcast=True)





@app.route('/')
def index():
  return render_template('index.html')

@socketio.on('request chunks')
def send_image(data):
  print('sending image...')
  chunks = []
  for chunk in data['chunks']:
    chunk['buffer'] = image.crop(chunk['rectangle']).tobytes()
    chunks += [chunk]
  emit('send chunks', {'chunks': chunks, 'first_time': data['first_time']})
  print('sent image')

@socketio.on('change pixel')
def change_pixel(data):
  global pixel_changes
  global last_pixel_change_time
  global counter

  x, y = int(data['x']), int(data['y'])

  pixel_index = (y * image.width + x) * 4

  color = tuple(map(int, re.findall('\d+', data['color'])))

  pixel_change = {'color': color, 'index': pixel_index, 'x': x, 'y': y}

  pixel_changes += [pixel_change]

  if time.time() - last_pixel_change_time < 2:
    counter += 1
  else:
    counter = 0

  last_pixel_change_time = time.time()

  if counter == 0 or counter >= 10:
    commit_pixel_changes()

  print((int(data['x']), int(data['y'])), color)


@socketio.on('request new user id')
def create_new_user():
  insertion = db.execute("INSERT INTO users (creation_time, last_accessed_time, logged_in) VALUES ('now', 'now', TRUE) RETURNING id")
  db.commit()
  user_id = list(insertion)[0][0]
  emit('give new user id', {'id': user_id})
  send_user_count()

@socketio.on('enter site')
def record_enter_site(data):
  db.execute("UPDATE users SET logged_in = TRUE, last_accessed_time = 'now' WHERE id = :id", {'id': data['id']})
  db.commit()
  send_user_count()

  commit_pixel_changes()

@socketio.on('exit site')
def record_exit_site(data):
  db.execute("UPDATE users SET logged_in = FALSE WHERE id = :id", {'id': data['id']})
  db.commit()
  send_user_count()

  commit_pixel_changes()

@socketio.on('enter tab')
def enter_tab():
  pass

@socketio.on('exit tab')
def exit_tab():
  pass

@socketio.on('request image dimensions')
def give_dimensions():
  emit('give image dimensions', {'width': image.width, 'height': image.height, 'chunk_size': chunk_size})
  print('gave image dimensions')