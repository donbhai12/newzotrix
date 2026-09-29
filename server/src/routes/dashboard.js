import express from 'express';
import Project from '../models/Project.js';
import Worker from '../models/Worker.js';
import Expense from '../models/Expense.js';
import Attendance from '../models/Attendance.js';
import { accountingCategoryFilter, expenseAccessFilter, projectAccessFilter, requireAuth, workerAccessFilter } from '../middleware/auth.js';
import { addDays, dateRange, eligibleWorker, todayISO } from '../utils/dates.js';

const router = express.Router();
router.use(requireAuth);

function calcWorker(workers, attendanceByWorker, worker, today) {
  let units = 0; let otHours = 0; let p=0,h=0,a=0,lateDays=0,lateMinutes=0,ot=0;
  const recs = attendanceByWorker.get(String(worker._id)) || [];
  for (const r of recs) {
    if (r.status === 'P') { units += 1; p++; }
    if (r.status === 'H') { units += 0.5; h++; }
    if (r.status === 'A') a++;
    otHours += Number(r.otHours || 0); ot += Number(r.otHours || 0);
    if (Number(r.lateMinutes || 0) > 0) { lateDays++; lateMinutes += Number(r.lateMinutes || 0); }
  }
  if (eligibleWorker(worker, today) && !recs.some(r => r.date === today)) { units += 1; p++; }
  const otRate = Number(worker.otRate || ((Number(worker.wage || 0) / 8) || 0));
  return { earned: units * Number(worker.wage || 0) + otHours * otRate, paid: 0, units, p,h,a,ot,lateDays,lateMinutes };
}

router.get('/', async (req, res) => {
  if (req.user.role === 'labour') {
    const worker = await Worker.findById(req.user.workerId);
    if (!worker) return res.json({ mode:'labour', worker:null, summary:{} });
    const expenses = await Expense.find({ workerId: worker._id, deletedAt:null }).sort({ date:-1 }).limit(500);
    const attendance = await Attendance.find({ workerId: worker._id, deletedAt:null }).sort({ date:-1 }).limit(1000);
    const byWorker = new Map([[String(worker._id), attendance]]);
    const calc = calcWorker([worker], byWorker, worker, todayISO());
    calc.paid = expenses.filter(e=>e.type==='Labour Payment').reduce((a,e)=>a+Number(e.amount||0),0);
    return res.json({ mode:'labour', worker, summary:{...calc, balance:calc.earned-calc.paid}, payments:expenses.slice(0,20), attendance:attendance.slice(0,60) });
  }

  const today = todayISO();
  const since14 = addDays(today, -13);
  const since30 = addDays(today, -29);
  const [projects, workers, expenses, attendance] = await Promise.all([
    Project.find({ deletedAt:null, ...projectAccessFilter(req.user) }),
    Worker.find({ deletedAt:null, ...workerAccessFilter(req.user) }),
    Expense.find({ deletedAt:null, date:{$gte:since30}, ...accountingCategoryFilter(req.user), ...expenseAccessFilter(req.user) }).sort({date:-1,createdAt:-1}),
    Attendance.find({ deletedAt:null, ...workerAccessFilter(req.user) })
  ]);
  const attendanceByWorker = new Map();
  for (const r of attendance) {
    const k=String(r.workerId); if(!attendanceByWorker.has(k)) attendanceByWorker.set(k,[]); attendanceByWorker.get(k).push(r);
  }
  const workerCalc = workers.map(w=>({w, c:calcWorker(workers,attendanceByWorker,w,today)}));
  const totalEarned = workerCalc.reduce((s,x)=>s+x.c.earned,0);
  const totalLabourPaid = expenses.filter(e=>e.type==='Labour Payment').reduce((s,e)=>s+Number(e.amount||0),0);
  const totalExpense = expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const activeWorkers = workers.filter(w=>w.status==='Active').length;
  const todayRows = workers.map(w=>{
    const rec=(attendanceByWorker.get(String(w._id))||[]).find(x=>x.date===today);
    const status=rec?rec.status:(eligibleWorker(w,today)&&w.status==='Active'?'P':'-');
    return {workerId:w._id,name:w.name,status,otHours:rec?.otHours||0,lateMinutes:rec?.lateMinutes||0};
  });
  const category = {}; for(const e of expenses) category[e.category]=(category[e.category]||0)+Number(e.amount||0);
  const projectSpend = {}; for(const e of expenses) if(e.projectId) projectSpend[String(e.projectId)]=(projectSpend[String(e.projectId)]||0)+Number(e.amount||0);
  const trendDates=dateRange(today,14); const trend=trendDates.map(date=>({date,total:expenses.filter(e=>e.date===date).reduce((s,e)=>s+Number(e.amount||0),0)}));
  const recent=expenses.slice(0,20);
  res.json({ mode:'manager', kpi:{projects:projects.length,activeWorkers,totalExpense,totalLabourPaid,labourDue:Math.max(0,totalEarned-totalLabourPaid)}, trend, category, projectSpend, todayRows, recent, projects, workers, dates:{today,since14,since30} });
});

export default router;
