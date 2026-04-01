from typing import List, Dict
from fastapi import WebSocket
from datetime import datetime
from sqlalchemy.orm import Session
from .models import User

class ConnectionManager:
    def __init__(self):
        # Maps user_id to their WebSocket connection
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int, db: Session):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        
        # Update user status to online
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_online = True
            db.commit()

    def disconnect(self, user_id: int, db: Session):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        
        # Update user status to offline and set last_seen
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_online = False
            user.last_seen = datetime.utcnow()
            db.commit()

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            websocket = self.active_connections[user_id]
            await websocket.send_json(message)

    async def broadcast(self, message: dict, user_ids: List[int] = None):
        """Broadcasts a message to specific user IDs or everyone if user_ids is None."""
        if user_ids is None:
            # Broadcast to everyone online
            for user_id, websocket in self.active_connections.items():
                await websocket.send_json(message)
        else:
            # Broadcast only to relevant group members who are online
            for user_id in user_ids:
                if user_id in self.active_connections:
                    await self.active_connections[user_id].send_json(message)

manager = ConnectionManager()
