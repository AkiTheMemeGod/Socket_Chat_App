from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit
import random
import string

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

rooms = {}  # room_code: [usernames]

@app.route('/')
def index():
    return render_template('index.html')

def generate_room_code(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

@socketio.on('create_room')
def on_create_room(data):
    username = data['username']
    room_code = generate_room_code()
    while room_code in rooms:
        room_code = generate_room_code()
    rooms[room_code] = [username]
    join_room(room_code)
    emit('room_created', {'room': room_code})
    emit('user_joined', {'username': username}, room=room_code)

@socketio.on('join_room')
def on_join_room(data):
    username = data['username']
    room_code = data['room']
    if room_code in rooms:
        rooms[room_code].append(username)
        join_room(room_code)
        emit('room_joined', {'room': room_code})
        emit('user_joined', {'username': username}, room=room_code)
    else:
        emit('error', {'message': 'Room does not exist.'})

@socketio.on('send_message')
def on_send_message(data):
    room = data['room']
    username = data['username']
    message = data['message']
    emit('receive_message', {'username': username, 'message': message}, room=room)

if __name__ == '__main__':
    socketio.run(app, debug=True)
