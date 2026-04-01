from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List
import json
import jwt
import os

from .database import engine, Base, get_db
from .models import User, Message, Group
from .schemas import UserCreate, UserLogin, UserResponse, Token, MessageCreate, MessageResponse, GroupCreate, GroupResponse
from .auth import create_access_token, verify_password, get_current_user, SECRET_KEY, ALGORITHM
from .crud import (
    get_user_by_username, create_user, get_users, create_message, get_chat_history,
    create_group, get_groups, get_group_history, add_user_to_group, remove_user_from_group
)
from .websocket import manager

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Real-Time Chat Application")

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication Routes
@app.post("/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = get_user_by_username(db, user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    return create_user(db, user)

@app.post("/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = get_user_by_username(db, user.username)
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    access_token = create_access_token(data={"sub": db_user.username})
    return {"access_token": access_token, "token_type": "bearer"}

# User Routes
@app.get("/users", response_model=List[UserResponse])
def get_all_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_users(db)

@app.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# Messaging Routes
@app.get("/messages/private/{user_id}", response_model=List[MessageResponse])
def get_private_messages(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_chat_history(db, current_user.id, user_id)

@app.get("/messages/group/{group_id}", response_model=List[MessageResponse])
def get_group_messages(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_group_history(db, group_id)

# Group Routes
@app.post("/groups", response_model=GroupResponse)
def create_new_group(group: GroupCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return create_group(db, group, current_user.id)

@app.get("/groups", response_model=List[GroupResponse])
def get_user_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_groups(db, current_user.id)

@app.post("/groups/{group_id}/members/{user_id}")
def add_member_to_group(group_id: int, user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return add_user_to_group(db, group_id, user_id)

@app.delete("/groups/{group_id}/members/{user_id}")
def remove_member_from_group(group_id: int, user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return remove_user_from_group(db, group_id, user_id)

# WebSocket Endpoint
@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    db = next(get_db())
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            await websocket.close(code=1008)
            return
        user = get_user_by_username(db, username)
        if not user:
            await websocket.close(code=1008)
            return
    except jwt.PyJWTError:
        await websocket.close(code=1008)
        return

    user_id = user.id
    await manager.connect(websocket, user_id, db)
    
    # Broadcast status change
    await manager.broadcast({"type": "status", "user_id": user_id, "is_online": True})

    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Save message to DB
            msg_create = MessageCreate(
                content=message_data["content"],
                receiver_id=message_data.get("receiver_id"),
                group_id=message_data.get("group_id")
            )
            db_message = create_message(db, msg_create, user_id)
            
            response_msg = {
                "id": db_message.id,
                "content": db_message.content,
                "sender_id": user_id,
                "sender_name": user.username,
                "receiver_id": db_message.receiver_id,
                "group_id": db_message.group_id,
                "timestamp": db_message.timestamp.isoformat()
            }
            
            if db_message.group_id:
                # Group message
                group = db.query(Group).filter(Group.id == db_message.group_id).first()
                if group:
                    member_ids = [m.id for m in group.members]
                    await manager.broadcast(response_msg, member_ids)
            elif db_message.receiver_id:
                # Private message - send to receiver and sender
                await manager.send_personal_message(response_msg, db_message.receiver_id)
                await manager.send_personal_message(response_msg, user_id)
                
    except WebSocketDisconnect:
        manager.disconnect(user_id, db)
        await manager.broadcast({"type": "status", "user_id": user_id, "is_online": False, "last_seen": datetime.utcnow().isoformat()})
    finally:
        db.close()

# Serve Frontend
current_dir = os.path.dirname(os.path.abspath(__file__))
# app is inside backend/app, so we go up two levels to get to the root where 'frontend' is
frontend_path = os.path.join(os.path.dirname(os.path.dirname(current_dir)), "frontend")

if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    print(f"Warning: Frontend path not found at {frontend_path}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
