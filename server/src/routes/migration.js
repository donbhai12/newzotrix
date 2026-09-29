import express from 'express';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import Project from '../models/Project.js';
import Worker from '../models/Worker.js';
import Attendance from '../models/Attendance.js';
import Expense from '../models/Expense.js';
import User from '../models/User.js';
import { hashPassword } from '../utils/auth.js';
import { audit } from '../utils/audit.js';
import { todayISO } from '../utils/dates.js';

const router = express.Router();
router.use(requireAuth, allowRoles('master'));

function tempPassword() {
  return `Ztx!${Math.random().toString(36).slice(2,8).toUpperCase()}${Math.floor(10+Math.random()*90)}`;
}
function mapOldAttendance(input) {
  const out=[];
  if (Array.isArray(input)) return input;
  if (input && typeof input==='object') {
    for (const [date, day] of Object.entries(input)) {
      if (day && typeof day==='object') {
        for (const [workerId, rec] of Object.entries(day)) out.push({date,workerId,...rec});
      }
    }
  }
  return out;
}

router.post('/import', async (req,res)=>{
  const data=req.body?.data || req.body;
  if(!data || typeof data!=='object') return res.status(400).json({message:'Invalid backup JSON'});
  const generatedCredentials=[]; const projectMap=new Map(); const workerMap=new Map(); let imported={projects:0,workers:0,attendance:0,expenses:0};

  for(const p of (data.projects||[])){
    if(!p.name) continue;
    const doc=await Project.findOneAndUpdate({legacyId:String(p.id||'')},{
      $set:{name:String(p.name),code:String(p.code||''),client:String(p.client||''),location:String(p.location||''),budget:Number(p.budget||0),progress:Number(p.progress||0),start:String(p.start||''),end:String(p.end||''),status:['Active','Planning','Hold','Completed'].includes(p.status)?p.status:'Active',deletedAt:null}
    },{upsert:true,new:true,setDefaultsOnInsert:true});
    if(p.id) projectMap.set(String(p.id),doc._id); imported.projects++;
  }

  for(const w of (data.workers||[])){
    if(!w.name) continue;
    const projectId=w.projectId?projectMap.get(String(w.projectId)):null;
    const doc=await Worker.findOneAndUpdate({legacyId:String(w.id||'')},{
      $set:{name:String(w.name),role:String(w.role||'Labour'),mobile:String(w.mobile||''),wage:Number(w.wage||0),otRate:Number(w.otRate||0),joining:String(w.joining||todayISO()),projectId:projectId||null,status:['Active','Stopped'].includes(w.status)?w.status:'Active',stopDate:String(w.stopDate||''),stopReason:String(w.stopReason||''),bankName:String(w.bankName||''),accountHolder:String(w.accountHolder||''),accountNo:String(w.accountNo||''),ifsc:String(w.ifsc||''),upiId:String(w.upiId||''),photoUrl:String(w.photoUrl||w.photo||''),deletedAt:null}
    },{upsert:true,new:true,setDefaultsOnInsert:true});
    if(w.id) workerMap.set(String(w.id),doc._id); imported.workers++;
    const loginId=String(w.loginId||'').trim().toUpperCase().replace(/\s+/g,'');
    if(loginId){
      let user=await User.findOne({workerId:doc._id});
      if(!user){
        let finalLogin=loginId; if(await User.exists({loginId:finalLogin})) finalLogin=`${loginId}_${Math.floor(100+Math.random()*900)}`;
        const pw=tempPassword();
        user=await User.create({name:doc.name,loginId:finalLogin,passwordHash:await hashPassword(pw),role:'labour',mobile:doc.mobile,jobRole:doc.role,initials:doc.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(),workerId:doc._id,createdBy:req.user._id});
        generatedCredentials.push({name:doc.name,loginId:finalLogin,password:pw});
      }
    }
  }

  for(const r of mapOldAttendance(data.attendance)){
    const workerId=workerMap.get(String(r.workerId)); if(!workerId||!r.date) continue;
    await Attendance.findOneAndUpdate({workerId,date:String(r.date)},{
      $set:{status:['P','H','A'].includes(r.status)?r.status:'P',otHours:Number(r.otHours||0),lateMinutes:Number(r.lateMinutes||0),note:String(r.note||''),updatedBy:req.user._id,deletedAt:null}
    },{upsert:true,new:true,setDefaultsOnInsert:true}); imported.attendance++;
  }

  for(const e of (data.expenses||[])){
    if(!e.date||!e.description) continue;
    const projectId=e.projectId?projectMap.get(String(e.projectId)):null;
    const workerId=e.workerId?workerMap.get(String(e.workerId)):null;
    await Expense.findOneAndUpdate({legacyId:String(e.id||'')},{
      $set:{date:String(e.date),userId:req.user._id,projectId:projectId||null,type:['Work Expense','Labour Payment','Material Payment','Other Payment'].includes(e.type)?e.type:'Work Expense',category:String(e.category||'Other'),workerId:workerId||null,amount:Number(e.amount||0),paidTo:String(e.paidTo||''),description:String(e.description),mode:String(e.mode||'Cash'),receiptNo:String(e.receiptNo||''),note:String(e.note||''),deletedAt:null}
    },{upsert:true,new:true,setDefaultsOnInsert:true}); imported.expenses++;
  }
  await audit(req.user._id,'import_legacy_backup','Migration','',{imported});
  res.json({message:'Migration completed. Old passwords were not imported; newly generated labour credentials are shown below.',imported,generatedCredentials});
});

export default router;
