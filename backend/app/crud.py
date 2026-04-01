from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from .models import User, Message, Group, group_members
from .schemas import UserCreate, MessageCreate, GroupCreate
from .auth import get_password_hash

# User CRUD
def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()

def create_user(db: Session, user: UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_users(db: Session):
    return db.query(User).all()

# Message CRUD
def create_message(db: Session, message: MessageCreate, sender_id: int):
    db_message = Message(
        content=message.content,
        sender_id=sender_id,
        receiver_id=message.receiver_id,
        group_id=message.group_id
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message

def get_chat_history(db: Session, user1_id: int, user2_id: int):
    return db.query(Message).filter(
        or_(
            and_(Message.sender_id == user1_id, Message.receiver_id == user2_id),
            and_(Message.sender_id == user2_id, Message.receiver_id == user1_id)
        )
    ).order_by(Message.timestamp.asc()).all()

def get_group_history(db: Session, group_id: int):
    return db.query(Message).filter(Message.group_id == group_id).order_by(Message.timestamp.asc()).all()

# Group CRUD
def create_group(db: Session, group: GroupCreate, creator_id: int):
    db_group = Group(name=group.name, created_by=creator_id)
    creator = db.query(User).filter(User.id == creator_id).first()
    db_group.members.append(creator)
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    return db_group

def get_groups(db: Session, user_id: int):
    # Returns all groups where the user is a member
    return db.query(Group).join(Group.members).filter(User.id == user_id).all()

def add_user_to_group(db: Session, group_id: int, user_id: int):
    db_group = db.query(Group).filter(Group.id == group_id).first()
    db_user = db.query(User).filter(User.id == user_id).first()
    if db_group and db_user:
        db_group.members.append(db_user)
        db.commit()
    return db_group

def remove_user_from_group(db: Session, group_id: int, user_id: int):
    db_group = db.query(Group).filter(Group.id == group_id).first()
    db_user = db.query(User).filter(User.id == user_id).first()
    if db_group and db_user:
        db_group.members.remove(db_user)
        db.commit()
    return db_group
