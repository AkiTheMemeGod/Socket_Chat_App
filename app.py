from flask import Flask, render_template, request, redirect, url_for, session, jsonify, send_from_directory, send_file
from flask_socketio import SocketIO, emit, join_room
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
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            profile_picture TEXT NOT NULL
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
            read INTEGER DEFAULT 0,
            read_at DATETIME,
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

        c.execute('''CREATE TABLE "group"
                     (
                         id         INTEGER PRIMARY KEY AUTOINCREMENT,
                         name       TEXT NOT NULL,
                         owner_id   INTEGER REFERENCES user (id),
                         created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                     )''')
        c.execute('''CREATE TABLE group_member
                     (
                         id         INTEGER PRIMARY KEY AUTOINCREMENT,
                         group_id   INTEGER REFERENCES "group" (id),
                         user_id    INTEGER REFERENCES user (id),
                         invited_by INTEGER REFERENCES user (id),
                         status     TEXT CHECK (status IN ('pending', 'accepted')) DEFAULT 'pending',
                         joined_at  DATETIME
                     )''')
        c.execute('''CREATE TABLE group_message
                     (
                         id        INTEGER PRIMARY KEY AUTOINCREMENT,
                         group_id  INTEGER REFERENCES "group" (id),
                         sender_id INTEGER REFERENCES user (id),
                         message   TEXT NOT NULL,
                         timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
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
    with open('static/pfp.png', 'rb') as f:
        pic_data = f.read()
    wb = WarBorne()
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        conn = get_db()
        c = conn.cursor()
        try:
            c.execute('INSERT INTO user (username, password_hash, profile_picture) VALUES (?, ?, ?)',
                      (username, wb.wb_hash(password), pic_data))
            conn.commit()
            conn.commit()
        except sqlite3.IntegrityError:
            return render_template('signup.html', error='Username already exists')
        user_id = c.lastrowid
        session['user_id'] = user_id
        session['username'] = username
        return redirect(url_for('index'))
    return render_template('index.html')

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
    return render_template('index.html')

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
        return jsonify({'error': 'Missing friend_id'}), 400

    conn = get_db()
    c = conn.cursor()
    user_id = session['user_id']

    # Get messages with read status - query both directions of conversation
    c.execute('''
        SELECT m.*, 
               sender.username as sender_name, 
               receiver.username as receiver_name
        FROM message m
        JOIN user sender ON m.sender_id = sender.id
        JOIN user receiver ON m.receiver_id = receiver.id
        WHERE (m.sender_id = ? AND m.receiver_id = ?) 
           OR (m.sender_id = ? AND m.receiver_id = ?)
        ORDER BY m.timestamp ASC
    ''', (user_id, friend_id, friend_id, user_id))

    messages = []
    for row in c.fetchall():
        print(dict(row))
        messages.append({
            'id': row['id'],
            'message': row['message'],
            'sender': row['sender_name'],
            'sender_id': row['sender_id'],
            'receiver': row['receiver_name'],
            'receiver_id': row['receiver_id'],
            'timestamp': row['timestamp'],
            'read': bool(row['read']),
            'read_at': row['read_at'] if row['read'] else None,
            #'file_id': row.get('file_id'),
            #'filetype': row.get('filetype'),
            #'filename': row.get('filename')
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
    print(timestamp)
    print(formatted_time)

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
                  (sender_id, receiver_id, f'[fileid]{file_id}|{filetype}|{filename}', formatted_time))
        conn.commit()
    else:
        c.execute('INSERT INTO message (sender_id, receiver_id, message, timestamp) VALUES (?, ?, ?, ?)',
                  (sender_id, receiver_id, message, formatted_time))
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

@app.route('/settings', methods=['GET', 'POST'])
def settings():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    if request.method == 'POST':
        # Handle profile picture upload
        if 'profile_picture' in request.files:
            file = request.files['profile_picture']
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(filepath)

                # Update the user's profile picture in the database
                conn = get_db()
                c = conn.cursor()
                c.execute('UPDATE user SET profile_picture = ? WHERE id = ?', (filename, session['user_id']))
                conn.commit()

                return redirect(url_for('settings'))

    return render_template('settings.html', username=session['username'])

@app.route('/api/mark_read', methods=['POST'])
def mark_messages_read():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    sender_id = data.get('sender_id')

    if not sender_id:
        return jsonify({'error': 'Missing sender_id'}), 400

    conn = get_db()
    c = conn.cursor()
    now = datetime.now().isoformat(sep=' ', timespec='seconds')

    # Mark unread messages as read
    c.execute('''
        UPDATE message
        SET read = 1, read_at = ?
        WHERE sender_id = ? AND receiver_id = ? AND read = 0
    ''', (now, sender_id, session['user_id']))

    # Get the number of affected rows
    updated_rows = c.rowcount
    conn.commit()

    # Notify sender about read messages if any messages were updated
    if updated_rows > 0 and sender_id in user_sid_map:
        socketio.emit('messages_read', {
            'reader_id': session['user_id'],
            'timestamp': now
        }, room=user_sid_map[sender_id])

    return jsonify({'success': True, 'count': updated_rows})



@socketio.on('group_create')
def handle_group_create(data):
    name      = data['name']
    members   = data['member_ids']           # list[int]
    owner_id  = session['user_id']

    conn = get_db()
    cur  = conn.cursor()
    cur.execute('INSERT INTO "group"(name, owner_id) VALUES (?,?)',
                (name, owner_id))
    group_id = cur.lastrowid

    # owner auto-accepts
    cur.execute('INSERT INTO group_member (group_id,user_id,status,joined_at) '
                'VALUES (?,?,?,CURRENT_TIMESTAMP)',
                (group_id, owner_id, 'accepted'))

    # invite friends
    for uid in members:
        cur.execute('INSERT INTO group_member (group_id,user_id,invited_by) '
                    'VALUES (?,?,?)', (group_id, uid, owner_id))
        if uid in user_sid_map:                      # friend is on-line
            socketio.emit('group_invite',
                          {'group_id': group_id, 'group_name': name,
                           'inviter': session["username"]},
                          room=user_sid_map[uid])

    conn.commit()
    join_room(f'group_{group_id}')
    emit('group_created', {'group_id': group_id})

@socketio.on('group_accept')
def handle_group_accept(data):
    gid  = data['group_id']
    uid  = session['user_id']
    conn = get_db(); cur = conn.cursor()

    cur.execute('UPDATE group_member SET status="accepted", '
                'joined_at=CURRENT_TIMESTAMP '
                'WHERE group_id=? AND user_id=? AND status="pending"',
                (gid, uid))
    if cur.rowcount:
        join_room(f'group_{gid}')
        socketio.emit('member_joined',
                      {'user': session['username'], 'uid': uid},
                      room=f'group_{gid}')
        conn.commit()

@socketio.on('group_message')
def handle_group_message(data):
    gid     = data['group_id']
    msg     = data['message']
    sender  = session['user_id']
    conn    = get_db(); cur=conn.cursor()

    cur.execute('INSERT INTO group_message(group_id,sender_id,message) '
                'VALUES (?,?,?)', (gid, sender, msg))
    conn.commit()

    emit('group_message',
         {'group_id': gid,
          'sender': session["username"],
          'message': msg,
          'timestamp': datetime.now().strftime('%I:%M %p')},
         room=f'group_{gid}')

if __name__ == '__main__':
    socketio.run(app, debug=True)
