from flask import Flask, render_template, request, redirect, url_for, session, jsonify, send_from_directory, send_file
from flask_socketio import SocketIO, emit, join_room
# from werkzeug.security import generate_password_hash, check_password_hash
from warborne import WarBorne
import sqlite3
import os
from datetime import datetime
from werkzeug.utils import secure_filename
from io import BytesIO
try:
    from PIL import Image
except ImportError:
    Image = None

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

DB_NAME = 'chatapp.db'

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar', 'mp4', 'mp3', 'csv'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    if not os.path.exists(DB_NAME):
        conn = get_db()
        c = conn.cursor()
        c.execute('''CREATE TABLE user (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )''')
        c.execute('''CREATE TABLE friend (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES user(id),
            FOREIGN KEY(friend_id) REFERENCES user(id)
        )''')
        c.execute('''CREATE TABLE message (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            FOREIGN KEY(sender_id) REFERENCES user(id),
            FOREIGN KEY(receiver_id) REFERENCES user(id)
        )''')
        c.execute('''CREATE TABLE file (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            mimetype TEXT NOT NULL,
            data BLOB NOT NULL,
            timestamp DATETIME NOT NULL,
            FOREIGN KEY(user_id) REFERENCES user(id)
        )''')
        conn.commit()
        conn.close()

init_db()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    if 'user_id' in session:
        return render_template('chat.html', username=session['username'])
    return redirect(url_for('login'))

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    wb = WarBorne()
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        conn = get_db()
        c = conn.cursor()
        try:
            c.execute('INSERT INTO user (username, password_hash) VALUES (?, ?)',
                      (username, wb.wb_hash(password)))
            conn.commit()
        except sqlite3.IntegrityError:
            return render_template('signup.html', error='Username already exists')
        user_id = c.lastrowid
        session['user_id'] = user_id
        session['username'] = username
        return redirect(url_for('index'))
    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    wb = WarBorne()
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        conn = get_db()
        c = conn.cursor()
        c.execute('SELECT * FROM user WHERE username = ?', (username,))
        user = c.fetchone()
        if user and user['password_hash'] == wb.wb_hash(password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            return redirect(url_for('index'))
        else:
            return render_template('login.html', error='Invalid credentials')
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/api/search_users')
def search_users():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    query = request.args.get('query', '').strip()
    if not query:
        return jsonify([])
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT id, username FROM user WHERE username LIKE ? AND id != ?', (f'%{query}%', session['user_id']))
    users = [{'id': row['id'], 'username': row['username']} for row in c.fetchall()]
    return jsonify(users)

@app.route('/api/send_friend_request', methods=['POST'])
def send_friend_request():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    friend_id = data.get('friend_id')
    if not friend_id:
        return jsonify({'error': 'Missing friend_id'}), 400
    conn = get_db()
    c = conn.cursor()
    # Check if already friends or pending
    c.execute('''SELECT * FROM friend WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)''',
              (session['user_id'], friend_id, friend_id, session['user_id']))
    if c.fetchone():
        return jsonify({'error': 'Already friends or pending'}), 400
    c.execute('INSERT INTO friend (user_id, friend_id, status) VALUES (?, ?, ?)',
              (session['user_id'], friend_id, 'pending'))
    conn.commit()
    return jsonify({'success': True})

@app.route('/api/accept_friend_request', methods=['POST'])
def accept_friend_request():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    friend_id = data.get('friend_id')
    if not friend_id:
        return jsonify({'error': 'Missing friend_id'}), 400
    conn = get_db()
    c = conn.cursor()
    # Update status to accepted
    c.execute('''UPDATE friend SET status='accepted' WHERE user_id=? AND friend_id=? AND status='pending' ''',
              (friend_id, session['user_id']))
    conn.commit()
    return jsonify({'success': True})

@app.route('/api/friends')
def get_friends():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    conn = get_db()
    c = conn.cursor()
    # Accepted friends
    c.execute('''SELECT u.id, u.username FROM user u
                 JOIN friend f ON ((f.user_id = ? AND f.friend_id = u.id) OR (f.friend_id = ? AND f.user_id = u.id))
                 WHERE f.status = 'accepted' ''', (session['user_id'], session['user_id']))
    friends = [{'id': row['id'], 'username': row['username']} for row in c.fetchall()]
    # Pending requests sent
    c.execute('''SELECT u.id, u.username FROM user u
                 JOIN friend f ON f.friend_id = u.id
                 WHERE f.user_id = ? AND f.status = 'pending' ''', (session['user_id'],))
    pending_sent = [{'id': row['id'], 'username': row['username']} for row in c.fetchall()]
    # Pending requests received
    c.execute('''SELECT u.id, u.username FROM user u
                 JOIN friend f ON f.user_id = u.id
                 WHERE f.friend_id = ? AND f.status = 'pending' ''', (session['user_id'],))
    pending_received = [{'id': row['id'], 'username': row['username']} for row in c.fetchall()]
    return jsonify({'friends': friends, 'pending_sent': pending_sent, 'pending_received': pending_received})

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    file = request.files['file']
    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file'}), 400
    filename = secure_filename(file.filename)
    mimetype = file.mimetype
    user_id = session['user_id']
    timestamp = datetime.now().isoformat(sep=' ', timespec='seconds')
    file_data = file.read()
    # Compress image if possible
    if Image and mimetype.startswith('image/'):
        try:
            img = Image.open(BytesIO(file_data))
            buf = BytesIO()
            img.save(buf, format='JPEG', quality=85, optimize=True)
            file_data = buf.getvalue()
            mimetype = 'image/jpeg'
        except Exception:
            pass  # fallback to original
    # Store in DB
    conn = get_db()
    c = conn.cursor()
    c.execute('INSERT INTO file (user_id, filename, mimetype, data, timestamp) VALUES (?, ?, ?, ?, ?)',
              (user_id, filename, mimetype, file_data, timestamp))
    file_id = c.lastrowid
    conn.commit()
    return jsonify({
        'file_id': file_id,
        'filetype': mimetype,
        'filename': filename
    })

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/file/<int:file_id>')
def serve_file(file_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT filename, mimetype, data FROM file WHERE id=?', (file_id,))
    row = c.fetchone()
    if not row:
        return 'File not found', 404
    return send_file(
        BytesIO(row['data']),
        mimetype=row['mimetype'],
        download_name=row['filename'],
        as_attachment=False
    )

@app.route('/api/chat_history')
def chat_history():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    friend_id = request.args.get('friend_id')
    if not friend_id:
        return jsonify({'messages': []})
    conn = get_db()
    c = conn.cursor()
    c.execute('''SELECT m.*, u1.username as sender_name, u2.username as receiver_name FROM message m
                 JOIN user u1 ON m.sender_id = u1.id
                 JOIN user u2 ON m.receiver_id = u2.id
                 WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
                 ORDER BY m.timestamp ASC''',
              (session['user_id'], friend_id, friend_id, session['user_id']))
    messages = []
    for row in c.fetchall():
        # Format timestamp to be more readable
        timestamp = datetime.strptime(row['timestamp'], '%Y-%m-%d %H:%M:%S')
        formatted_time = timestamp.strftime('%I:%M %p')  # Format as 12-hour time with AM/PM

        msg = row['message']
        if msg.startswith('[fileid]'):
            _, rest = msg.split('[fileid]', 1)
            file_id, filetype, filename = rest.split('|', 2)
            messages.append({
                'sender': row['sender_name'],
                'message': '',
                'file_id': file_id,
                'filetype': filetype,
                'filename': filename,
                'timestamp': formatted_time
            })
        else:
            messages.append({
                'sender': row['sender_name'],
                'message': msg,
                'timestamp': formatted_time
            })
    return jsonify({'messages': messages})

# --- SOCKETIO PRIVATE MESSAGING ---
user_sid_map = {}  # user_id: sid

@socketio.on('connect')
def on_connect():
    if 'user_id' in session:
        user_id = session['user_id']
        user_sid_map[user_id] = request.sid

        # Update last seen time when user connects
        conn = get_db()
        c = conn.cursor()
        c.execute('UPDATE user SET last_seen = ? WHERE id = ?',
                 (datetime.now().isoformat(sep=' ', timespec='seconds'), user_id))
        conn.commit()

@socketio.on('disconnect')
def on_disconnect():
    if 'user_id' in session:
        user_id = session['user_id']
        # Update last seen time when user disconnects
        conn = get_db()
        c = conn.cursor()
        c.execute('UPDATE user SET last_seen = ? WHERE id = ?',
                 (datetime.now().isoformat(sep=' ', timespec='seconds'), user_id))
        conn.commit()

        if user_id in user_sid_map:
            del user_sid_map[user_id]

@socketio.on('private_message')
def handle_private_message(data):
    if 'user_id' not in session:
        return
    sender_id = session['user_id']
    receiver_id = data['to']
    message = data.get('message', '')
    file_id = data.get('file_id')
    filetype = data.get('filetype')
    filename = data.get('filename')

    # Get current timestamp and format it
    now = datetime.now()
    timestamp = now.isoformat(sep=' ', timespec='seconds')
    formatted_time = now.strftime('%I:%M %p')

    # Save to DB
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT username FROM user WHERE id=?', (sender_id,))
    sender_name = c.fetchone()['username']
    c.execute('SELECT username FROM user WHERE id=?', (receiver_id,))
    receiver_name = c.fetchone()['username']

    if file_id:
        # Save as message with file id
        c.execute('INSERT INTO message (sender_id, receiver_id, message, timestamp) VALUES (?, ?, ?, ?)',
                  (sender_id, receiver_id, f'[fileid]{file_id}|{filetype}|{filename}', timestamp))
        conn.commit()
    else:
        c.execute('INSERT INTO message (sender_id, receiver_id, message, timestamp) VALUES (?, ?, ?, ?)',
                  (sender_id, receiver_id, message, timestamp))
        conn.commit()

    # Emit to sender
    emit('private_message', {
        'from_id': sender_id,
        'to_id': receiver_id,
        'sender': sender_name,
        'message': message,
        'file_id': file_id,
        'filetype': filetype,
        'filename': filename,
        'timestamp': formatted_time
    }, room=request.sid)

    # Emit to receiver if online
    if receiver_id in user_sid_map:
        emit('private_message', {
            'from_id': sender_id,
            'to_id': receiver_id,
            'sender': sender_name,
            'message': message,
            'file_id': file_id,
            'filetype': filetype,
            'filename': filename,
            'timestamp': formatted_time
        }, room=user_sid_map[receiver_id])


@app.route('/api/last_seen')
def last_seen():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    friend_id = request.args.get('friend_id')
    if not friend_id:
        return jsonify({'status': 'unknown'})

    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT last_seen FROM user WHERE id = ?', (friend_id,))
    row = c.fetchone()

    if not row:
        return jsonify({'status': 'offline', 'last_seen': 'Unknown'})

    last_seen_time = datetime.strptime(row['last_seen'], '%Y-%m-%d %H:%M:%S')
    now = datetime.now()
    diff = now - last_seen_time

    # Format the last seen time in a human-readable way
    if diff.days > 0:
        if diff.days == 1:
            last_seen_formatted = "yesterday"
        else:
            last_seen_formatted = f"{diff.days} days ago"
    elif diff.seconds >= 3600:
        hours = diff.seconds // 3600
        last_seen_formatted = f"{hours}h ago"
    elif diff.seconds >= 60:
        minutes = diff.seconds // 60
        last_seen_formatted = f"{minutes}m ago"
    else:
        last_seen_formatted = "just now"

    status = 'online' if friend_id in user_sid_map else 'offline'

    return jsonify({
        'status': status,
        'last_seen': last_seen_formatted,
        'timestamp': last_seen_time.strftime('%Y-%m-%d %H:%M:%S')
    })
# More endpoints for friends, chat, etc. will be added next.

if __name__ == '__main__':
    socketio.run(app, debug=True)
