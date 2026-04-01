from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import List, Optional

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(UserBase):
    id: int
    is_online: bool
    last_seen: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class MessageBase(BaseModel):
    content: str

class MessageCreate(MessageBase):
    receiver_id: Optional[int] = None
    group_id: Optional[int] = None

class MessageResponse(MessageBase):
    id: int
    sender_id: int
    receiver_id: Optional[int]
    group_id: Optional[int]
    timestamp: datetime

    class Config:
        from_attributes = True

class GroupBase(BaseModel):
    name: str

class GroupCreate(GroupBase):
    pass

class GroupResponse(GroupBase):
    id: int
    created_at: datetime
    created_by: int
    members: List[UserResponse] = []

    class Config:
        from_attributes = True
