from fastapi import APIRouter,Depends,HTTPException
from sqlalchemy import select,or_
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.core.security import current_user
from backend.app.models import Employee,UpdateRequest,Notification
from backend.app.schemas import UpdateRequestCreate,UpdateReply
from backend.app.services.coordination import create_requests,reply_to_request,serialize_request

router=APIRouter(prefix='/api')

@router.get('/update-requests')
def list_requests(user:Employee=Depends(current_user),db:Session=Depends(get_db)):
    records=db.scalars(select(UpdateRequest).where(or_(UpdateRequest.requester_id==user.id,UpdateRequest.recipient_id==user.id)).order_by(UpdateRequest.id.desc()).limit(100))
    return [serialize_request(db,r,user) for r in records]

@router.post('/update-requests',status_code=201)
def request_updates(body:UpdateRequestCreate,user:Employee=Depends(current_user),db:Session=Depends(get_db)):
    records=create_requests(db,user,body.recipient_ids,body.prompt,body.channel)
    db.commit()
    return [serialize_request(db,r,user) for r in records]

@router.post('/update-requests/{request_id}/reply')
def reply(request_id:int,body:UpdateReply,user:Employee=Depends(current_user),db:Session=Depends(get_db)):
    record=db.get(UpdateRequest,request_id)
    if not record or record.recipient_id!=user.id:raise HTTPException(404,'Update request not found.')
    record=reply_to_request(db,user,record,body)
    notice=db.scalar(select(Notification).where(Notification.key==f'update-request:{record.id}',Notification.recipient_id==user.id))
    if notice:notice.read=True
    db.commit()
    return serialize_request(db,record,user)

@router.post('/update-requests/{request_id}/cancel')
def cancel(request_id:int,user:Employee=Depends(current_user),db:Session=Depends(get_db)):
    record=db.get(UpdateRequest,request_id)
    if not record or record.requester_id!=user.id:raise HTTPException(404,'Update request not found.')
    if record.status=='Responded':raise HTTPException(409,'This request has already received a response.')
    record.status='Cancelled';db.commit()
    return serialize_request(db,record,user)
