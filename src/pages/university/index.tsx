import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Copy,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Image,
  Laptop,
  Mail,
  MailCheck,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  Video,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type StudentStatus = "active" | "pending" | "low_credit" | "suspended";

type Student = {
  initials: string;
  name: string;
  email: string;
  code: string;
  credits: number;
  status: StudentStatus;
  attendance: number;
  lastActive: string;
  lastAction: string;
  workspaceTitle: string;
  assignment: string;
  classId: string;
};

type ClassItem = {
  id: string;
  name: string;
  code: string;
  term: string;
  teacher: string;
  students: number;
  used: number;
  total: number;
  model: "Monthly Reset" | "Weekly Drip";
  schedule: string;
};

const dmdLogoSrc = "/dmd-digital-media-logo.png";

const initialClasses: ClassItem[] = [
  {
    id: "dm-101",
    name: "Digital Media",
    code: "DMD-101",
    term: "ภาคเรียนที่ 1 ปีการศึกษา 2569",
    teacher: "อ.ณัฐพงศ์ วัฒนศิลป์",
    students: 42,
    used: 5750,
    total: 20000,
    model: "Monthly Reset",
    schedule: "อังคาร 09:00 - 12:00",
  },
  {
    id: "md-204",
    name: "Motion Design Workshop",
    code: "DMD-204",
    term: "หลักสูตรพิเศษ 8 สัปดาห์",
    teacher: "อ.ปาริชาติ คงเจริญ",
    students: 28,
    used: 2440,
    total: 11200,
    model: "Weekly Drip",
    schedule: "พฤหัส 13:00 - 16:00",
  },
  {
    id: "ai-310",
    name: "AI Content Studio",
    code: "DMD-310",
    term: "โครงการเสริมทักษะ",
    teacher: "อ.กิตติกร มีเดีย",
    students: 35,
    used: 3180,
    total: 14000,
    model: "Weekly Drip",
    schedule: "เสาร์ 10:00 - 15:00",
  },
];

const initialStudents: Student[] = [
  {
    initials: "พล",
    name: "พลอยไพลิน กาญจนวัฒน์",
    email: "ploypailin.ka@psc.ac.th",
    code: "669020014",
    credits: 150,
    status: "active",
    attendance: 96,
    lastActive: "วันนี้ 10:42",
    lastAction: "สร้าง key visual แคมเปญร้านกาแฟ",
    workspaceTitle: "Cafe Campaign Visual Board",
    assignment: "Brand Poster Week 4",
    classId: "dm-101",
  },
  {
    initials: "ธน",
    name: "ธนภัทร ศรีอรุณ",
    email: "thanapat.sr@psc.ac.th",
    code: "669020021",
    credits: 60,
    status: "low_credit",
    attendance: 88,
    lastActive: "วันนี้ 09:18",
    lastAction: "ตัดต่อวิดีโอโปรโมต 15 วินาที",
    workspaceTitle: "Short Video Product Launch",
    assignment: "Video Ads Draft",
    classId: "dm-101",
  },
  {
    initials: "มี",
    name: "มีนา รัตนโชติ",
    email: "meena.ra@psc.ac.th",
    code: "669020037",
    credits: 190,
    status: "active",
    attendance: 100,
    lastActive: "เมื่อวาน 17:05",
    lastAction: "เขียนสคริปต์ voice over",
    workspaceTitle: "Voice Over Script Lab",
    assignment: "Storytelling Prompt",
    classId: "dm-101",
  },
  {
    initials: "กว",
    name: "กวินทร์ ธรรมรักษ์",
    email: "kawin.th@psc.ac.th",
    code: "669020044",
    credits: 20,
    status: "pending",
    attendance: 74,
    lastActive: "2 วันที่แล้ว",
    lastAction: "รออาจารย์อนุมัติเครดิตเพิ่ม",
    workspaceTitle: "Packaging Moodboard",
    assignment: "Visual Direction",
    classId: "dm-101",
  },
  {
    initials: "อร",
    name: "อรณิชา พงษ์พิทักษ์",
    email: "oranicha.po@psc.ac.th",
    code: "669020052",
    credits: 112,
    status: "active",
    attendance: 91,
    lastActive: "วันนี้ 11:25",
    lastAction: "อัปโหลด reference สำหรับภาพสินค้า",
    workspaceTitle: "Cosmetic Product Shot",
    assignment: "Product Retouch",
    classId: "dm-101",
  },
  {
    initials: "ภค",
    name: "ภคิน แซ่ตั้ง",
    email: "pakin.sa@psc.ac.th",
    code: "669020063",
    credits: 0,
    status: "suspended",
    attendance: 52,
    lastActive: "12 วันที่แล้ว",
    lastAction: "พักการใช้งานชั่วคราว",
    workspaceTitle: "Dormant Workspace",
    assignment: "Pending Review",
    classId: "dm-101",
  },
  {
    initials: "นน",
    name: "นนทกร เทพประสิทธิ์",
    email: "nontakorn.th@psc.ac.th",
    code: "669030008",
    credits: 95,
    status: "active",
    attendance: 82,
    lastActive: "วันนี้ 13:04",
    lastAction: "สร้าง motion storyboard",
    workspaceTitle: "Kinetic Type Storyboard",
    assignment: "Motion Board 02",
    classId: "md-204",
  },
  {
    initials: "แพ",
    name: "แพรวา อินทรสกุล",
    email: "praewa.in@psc.ac.th",
    code: "669040017",
    credits: 130,
    status: "active",
    attendance: 94,
    lastActive: "วันนี้ 12:11",
    lastAction: "สร้าง social content set",
    workspaceTitle: "Content Studio Weekly Pack",
    assignment: "AI Content Batch",
    classId: "ai-310",
  },
];

const reportRows = [
  { label: "Image Generation", value: 312, cost: 3210, trend: "+18%" },
  { label: "Video Generation", value: 46, cost: 1840, trend: "+9%" },
  { label: "Chat / Script", value: 128, cost: 520, trend: "-4%" },
  { label: "Upload Assets", value: 94, cost: 180, trend: "+22%" },
];

const activityFeed = [
  "อ.ณัฐพงศ์ เปิด QR เช็คชื่อรอบเช้า",
  "พลอยไพลินส่งงาน Brand Poster Week 4",
  "ระบบเติมเครดิต Monthly Reset ให้ 42 คน",
  "ธนภัทรขอเครดิตเพิ่ม 120 credits",
  "มีนาแชร์ workspace ให้อาจารย์ตรวจ",
];

export default function UniversityMockup() {
  const [selectedClassId, setSelectedClassId] = useState(initialClasses[0].id);
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [qrOpen, setQrOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student>(initialStudents[0]);
  const [search, setSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("ข้อมูลคลาสซิงก์ล่าสุดเมื่อ 10:42 น.");

  const selectedClass = initialClasses.find((item) => item.id === selectedClassId) ?? initialClasses[0];
  const classStudents = students.filter((student) => student.classId === selectedClass.id);
  const filteredStudents = classStudents.filter((student) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      student.name.toLowerCase().includes(q) ||
      student.email.toLowerCase().includes(q) ||
      student.code.includes(q)
    );
  });

  const classTotals = useMemo(() => {
    const used = classStudents.reduce((sum, student) => sum + (200 - student.credits), 0);
    const total = Math.max(classStudents.length * 200, selectedClass.total);
    return {
      students: Math.max(classStudents.length, selectedClass.students),
      used: Math.max(used, selectedClass.used),
      total,
    };
  }, [classStudents, selectedClass]);

  const remaining = Math.max(classTotals.total - classTotals.used, 0);
  const usedPercent = Math.round((classTotals.used / classTotals.total) * 100);
  const average = Math.round(classTotals.used / Math.max(classTotals.students, 1));

  const modelCopy = useMemo(() => {
    if (selectedClass.model === "Monthly Reset") {
      return {
        title: "200 เครดิต / เดือน / นักเรียน",
        detail: "รีเซ็ตอัตโนมัติทุกวันที่ 1 ใช้ไม่หมดไม่ทบ",
      };
    }
    return {
      title: "50 เครดิต / สัปดาห์ / นักเรียน",
      detail: "เติมทุกวันจันทร์ เครดิตสะสมข้ามสัปดาห์ได้",
    };
  }, [selectedClass.model]);

  const addStudent = () => {
    const email = inviteEmail.trim().toLowerCase();
    const code = studentCode.trim();
    if (!email || !code) {
      setNotice("กรุณากรอก email และรหัสนักศึกษาให้ครบก่อนเพิ่มนักเรียน");
      return;
    }
    const generatedName = email
      .split("@")[0]
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "New Student";
    const newStudent: Student = {
      initials: generatedName.slice(0, 2).toUpperCase(),
      name: generatedName,
      email,
      code,
      credits: selectedClass.model === "Monthly Reset" ? 200 : 50,
      status: "pending",
      attendance: 0,
      lastActive: "เพิ่งเพิ่ม",
      lastAction: note.trim() || "รอยืนยันคำเชิญเข้าคลาส",
      workspaceTitle: `${selectedClass.name} Workspace`,
      assignment: "Onboarding",
      classId: selectedClass.id,
    };
    setStudents((prev) => [newStudent, ...prev]);
    setSelectedStudent(newStudent);
    setInviteEmail("");
    setStudentCode("");
    setNote("");
    setNotice(`เพิ่ม ${generatedName} เข้าคลาส ${selectedClass.name} แล้ว`);
    setAddOpen(false);
  };

  const openStudentWorkspace = (student: Student) => {
    setSelectedStudent(student);
    setWorkspaceOpen(true);
  };

  return (
    <div className="min-h-full overflow-x-hidden bg-[#f6f7fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex w-full items-center justify-between gap-4 px-5 py-3 lg:px-8 lg:py-4">
          <div className="flex min-w-0 items-center gap-4">
            <img src={dmdLogoSrc} alt="DMD" className="h-12 w-[132px] shrink-0 object-contain sm:w-[156px]" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">PSC College Management</h1>
                <Badge className="bg-fuchsia-600 text-white hover:bg-fuchsia-600">DMD</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">Digital Media Design · MediaForge for Education</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <Button variant="outline" className="h-11 gap-2">
              <Download className="h-4 w-4" />
              ส่งออกรายงาน
            </Button>
            <Button onClick={() => setAddOpen(true)} className="h-11 gap-2 bg-slate-950 text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" />
              เพิ่มนักเรียน
            </Button>
            <Button onClick={() => setQrOpen(true)} className="h-11 gap-2 bg-fuchsia-600 text-white hover:bg-fuchsia-700">
              <QrCode className="h-4 w-4" />
              สร้าง QR Code
            </Button>
          </div>
        </div>
        <div className="border-t border-slate-100 px-4 py-3 sm:px-5 lg:hidden">
          <div className="grid w-full grid-cols-2 gap-2">
            <Button onClick={() => setAddOpen(true)} variant="outline" className="h-11 gap-2">
              <UserPlus className="h-4 w-4" />
              เพิ่มนักเรียน
            </Button>
            <Button onClick={() => setQrOpen(true)} className="h-11 gap-2 bg-fuchsia-600 text-white hover:bg-fuchsia-700">
              <QrCode className="h-4 w-4" />
              สร้าง QR
            </Button>
          </div>
        </div>
      </header>

      <main className="grid w-full gap-4 px-5 py-5 lg:gap-6 lg:px-8 lg:py-6 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="grid gap-4 md:grid-cols-3 xl:block xl:space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <Building2 className="h-4 w-4" />
              วิทยาลัย
            </div>
            <button className="flex w-full items-center gap-3 rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3 text-left">
              <img src={dmdLogoSrc} alt="DMD" className="h-10 w-28 shrink-0 object-contain" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">Digital Media Design</div>
                <div className="text-xs text-slate-500">3 คลาส · 105 นักเรียน</div>
              </div>
              <ChevronRight className="h-4 w-4 text-fuchsia-500" />
            </button>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">คลาสของฉัน</div>
            <div className="space-y-1">
              {initialClasses.map((item) => {
                const active = item.id === selectedClass.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedClassId(item.id);
                      const first = students.find((student) => student.classId === item.id);
                      if (first) setSelectedStudent(first);
                    }}
                    className={cn(
                      "w-full rounded-md px-3 py-3 text-left transition-colors",
                      active ? "bg-slate-950 text-white" : "hover:bg-slate-100",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className={cn("h-4 w-4", active ? "text-fuchsia-300" : "text-slate-400")} />
                      <span className="truncate text-sm font-medium">{item.name}</span>
                    </div>
                    <div className={cn("mt-1 text-xs", active ? "text-slate-300" : "text-slate-500")}>
                      {item.model} · {item.students} students
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Enrollment Gate
            </div>
            <div className="space-y-3 text-sm text-slate-600">
              <FlowStep icon={ScanLine} label="สแกน QR หรือรับ invite link" />
              <FlowStep icon={MailCheck} label="ยืนยันด้วยอีเมล @psc.ac.th" />
              <FlowStep icon={CheckCircle2} label="เข้าคลาสและรับเครดิตอัตโนมัติ" />
            </div>
          </section>
        </aside>

        <section className="min-w-0 space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <GraduationCap className="h-4 w-4" />
                  {selectedClass.term} · {selectedClass.code}
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">{selectedClass.name}</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">
                  {modelCopy.title} · {modelCopy.detail} · {selectedClass.schedule}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <Badge variant="outline" className="border-slate-300 bg-white text-slate-700 hover:bg-white">ผู้สอน {selectedClass.teacher}</Badge>
                  <Badge variant="outline" className="border-slate-300 bg-white text-slate-700 hover:bg-white">{notice}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setAddOpen(true)} variant="outline" className="h-11 gap-2">
                  <UserPlus className="h-4 w-4" />
                  เพิ่มนักเรียน
                </Button>
                <Button onClick={() => setQrOpen(true)} className="h-11 gap-2 bg-fuchsia-600 text-white hover:bg-fuchsia-700">
                  <QrCode className="h-4 w-4" />
                  สร้าง QR Code
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Users} label="นักเรียนทั้งหมด" value={String(classTotals.students)} hint="+3 สัปดาห์นี้" />
            <Metric icon={WalletCards} label="เครดิตคงเหลือ" value={remaining.toLocaleString()} hint={`จาก ${classTotals.total.toLocaleString()}`} />
            <Metric icon={Activity} label="การใช้งานเดือนนี้" value={classTotals.used.toLocaleString()} hint={`เฉลี่ย ${average}/คน`} />
            <Metric icon={Sparkles} label="โมเดลเครดิต" value={selectedClass.model} hint={selectedClass.model === "Monthly Reset" ? "รีเซ็ตทุกเดือน" : "สะสมรายสัปดาห์"} />
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200">
              <TabsTrigger value="overview" className="min-h-11 min-w-24 px-4">หน้าแรก</TabsTrigger>
              <TabsTrigger value="students" className="min-h-11 min-w-24 px-4">นักเรียน</TabsTrigger>
              <TabsTrigger value="workspaces" className="min-h-11 min-w-[160px] px-4">Workspace Student</TabsTrigger>
              <TabsTrigger value="credits" className="min-h-11 min-w-24 px-4">เครดิต</TabsTrigger>
              <TabsTrigger value="analytics" className="min-h-11 min-w-24 px-4">Analytics</TabsTrigger>
              <TabsTrigger value="reports" className="min-h-11 min-w-24 px-4">รายงาน</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="m-0 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Credit Overview</h3>
                    <p className="text-sm text-slate-500">การใช้เครดิตของคลาสปัจจุบัน</p>
                  </div>
                  <Badge variant="outline" className="border-slate-300 bg-white text-slate-700 hover:bg-white">{usedPercent}% used</Badge>
                </div>
                <Progress value={usedPercent} className="h-2" />
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <SmallStat label="ใช้ไป" value={classTotals.used.toLocaleString()} />
                  <SmallStat label="เหลือ" value={remaining.toLocaleString()} />
                  <SmallStat label="วงเงินคลาส" value={classTotals.total.toLocaleString()} />
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <WorkflowTile icon={Image} title="สร้างภาพ" value="312 outputs" />
                  <WorkflowTile icon={Video} title="สร้างวิดีโอ" value="46 clips" />
                  <WorkflowTile icon={FileText} title="สคริปต์/รายงาน" value="128 drafts" />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold">Recent Activity</h3>
                <div className="mt-4 space-y-3">
                  {classStudents.slice(0, 5).map((student) => (
                    <button
                      key={student.code}
                      type="button"
                      onClick={() => openStudentWorkspace(student)}
                      className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-slate-50"
                    >
                      <AvatarText>{student.initials}</AvatarText>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{student.name}</div>
                        <div className="truncate text-xs text-slate-500">{student.lastAction}</div>
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">{student.credits}/200</span>
                    </button>
                  ))}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="students" className="m-0">
              <StudentTable
                students={filteredStudents}
                selectedStudent={selectedStudent}
                search={search}
                onSearch={setSearch}
                onSelect={setSelectedStudent}
                onAdd={() => setAddOpen(true)}
              />
            </TabsContent>

            <TabsContent value="workspaces" className="m-0">
              <StudentWorkspaceGrid
                students={filteredStudents}
                selectedStudent={selectedStudent}
                search={search}
                onSearch={setSearch}
                onSelect={setSelectedStudent}
                onOpenWorkspace={openStudentWorkspace}
              />
            </TabsContent>

            <TabsContent value="credits" className="m-0 grid gap-4 xl:grid-cols-2">
              <CreditModelCard
                title="Monthly Reset Quota"
                subtitle="200 เครดิต / เดือน / นักเรียน"
                selected={selectedClass.model === "Monthly Reset"}
                points={["คาดเดาต้นทุนได้ 100%", "รีเซ็ตอัตโนมัติทุกวันที่ 1", "ใช้ไม่หมดไม่ทบ ป้องกัน overspend"]}
              />
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Weekly Drip</h3>
                    <p className="text-sm text-slate-500">50 เครดิตต่อสัปดาห์ สะสมได้ต่อเนื่อง</p>
                  </div>
                  {selectedClass.model === "Weekly Drip" && <Badge className="bg-fuchsia-600">Active</Badge>}
                </div>
                <div className="flex h-48 items-end gap-2 rounded-md bg-slate-50 p-4">
                  {[50, 100, 150, 200, 250, 300, 350, 400].map((value, index) => (
                    <div key={value} className="flex flex-1 flex-col items-center gap-2">
                      <div className="w-full rounded-t-md bg-fuchsia-500" style={{ height: `${(value / 400) * 150}px` }} />
                      <span className="text-[11px] text-slate-500">W{index + 1}</span>
                    </div>
                  ))}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="analytics" className="m-0 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Learning Analytics</h3>
                    <p className="text-sm text-slate-500">ภาพรวมพฤติกรรมการใช้ AI ของนักเรียนในคลาส</p>
                  </div>
                  <Badge variant="outline" className="border-slate-300 bg-white text-slate-700 hover:bg-white">Live snapshot</Badge>
                </div>
                <div className="mt-5 space-y-4">
                  {reportRows.map((row) => (
                    <div key={row.label}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium">{row.label}</span>
                        <span className="text-slate-500">{row.value} runs · {row.cost.toLocaleString()} credits · {row.trend}</span>
                      </div>
                      <Progress value={Math.min((row.cost / 3500) * 100, 100)} className="h-2" />
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold">Instructor Alerts</h3>
                <div className="mt-4 space-y-3">
                  <AlertLine tone="amber" text="4 คนเครดิตต่ำกว่า 30 credits" />
                  <AlertLine tone="emerald" text="12 workspace พร้อมส่งตรวจ" />
                  <AlertLine tone="slate" text="2 คนยังไม่ยืนยันอีเมล" />
                  <AlertLine tone="fuchsia" text="โมเดลที่ใช้มากสุด: Nano Banana Pro" />
                </div>
              </section>
            </TabsContent>

            <TabsContent value="reports" className="m-0 grid gap-4 md:grid-cols-3">
              <ReportTile icon={BarChart3} title="การใช้งานรายเดือน" value={`${classTotals.used.toLocaleString()} credits`} />
              <ReportTile icon={CircleDollarSign} title="งบประมาณคงเหลือ" value={`${remaining.toLocaleString()} credits`} />
              <ReportTile icon={CalendarClock} title="รอบเครดิตถัดไป" value="1 พ.ค. 2569" />
            </TabsContent>
          </Tabs>
        </section>
      </main>

      <AddStudentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        className={selectedClass.name}
        inviteEmail={inviteEmail}
        studentCode={studentCode}
        note={note}
        onEmailChange={setInviteEmail}
        onCodeChange={setStudentCode}
        onNoteChange={setNote}
        onAdd={addStudent}
      />

      <QrDialog open={qrOpen} onOpenChange={setQrOpen} selectedClass={selectedClass} modelCopy={modelCopy} />

      <WorkspaceDialog open={workspaceOpen} onOpenChange={setWorkspaceOpen} student={selectedStudent} />
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-3 truncate text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </section>
  );
}

function FlowStep({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-100">
        <Icon className="h-4 w-4 text-slate-600" />
      </span>
      <span>{label}</span>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function WorkflowTile({ icon: Icon, title, value }: { icon: LucideIcon; title: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <Icon className="h-4 w-4 text-fuchsia-600" />
      <div className="mt-2 text-sm font-medium">{title}</div>
      <div className="text-xs text-slate-500">{value}</div>
    </div>
  );
}

function AvatarText({ children }: { children: string }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-semibold text-white">
      {children}
    </span>
  );
}

function StudentTable({
  students,
  selectedStudent,
  search,
  onSearch,
  onSelect,
  onAdd,
}: {
  students: Student[];
  selectedStudent: Student;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (student: Student) => void;
  onAdd: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-semibold">หน้าจัดการนักเรียน</h3>
          <p className="text-sm text-slate-500">เพิ่ม ลบ ระงับ และปรับเครดิตของนักเรียนแต่ละคน</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="ค้นหาชื่อ email หรือรหัส" className="h-10 bg-white pl-9 text-slate-950 placeholder:text-slate-400 sm:w-64" />
          </div>
          <Button onClick={onAdd} className="h-10 gap-2 bg-slate-950 text-white hover:bg-slate-800">
            <UserPlus className="h-4 w-4" />
            เพิ่มนักเรียน
          </Button>
        </div>
      </div>
      <div className="border-b border-slate-100 bg-fuchsia-50 px-5 py-3 text-sm text-fuchsia-700">
        กำลังเลือก: {selectedStudent.name} · {selectedStudent.email}
      </div>
      <div className="divide-y divide-slate-100 lg:hidden">
        {students.map((student) => (
          <button
            key={student.code}
            type="button"
            onClick={() => onSelect(student)}
            className="flex min-h-[84px] w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
          >
            <AvatarText>{student.initials}</AvatarText>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{student.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{student.email}</span>
                <span className="font-mono">{student.code}</span>
              </div>
              <Progress value={(student.credits / 200) * 100} className="mt-2 h-1.5" />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <StatusBadge status={student.status} />
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </div>
          </button>
        ))}
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-5 py-3 text-left">นักเรียน</th>
              <th className="px-5 py-3 text-left">รหัส</th>
              <th className="px-5 py-3 text-left">Attendance</th>
              <th className="px-5 py-3 text-left">เครดิตคงเหลือ</th>
              <th className="px-5 py-3 text-left">สถานะ</th>
              <th className="px-5 py-3 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((student) => (
              <tr key={student.code} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <AvatarText>{student.initials}</AvatarText>
                    <div>
                      <div className="font-medium">{student.name}</div>
                      <div className="text-xs text-slate-500">{student.email}</div>
                      <div className="text-xs text-slate-400">{student.lastAction}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 font-mono text-slate-600">{student.code}</td>
                <td className="px-5 py-4">{student.attendance}%</td>
                <td className="px-5 py-4">
                  <div className="w-44">
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{student.credits} / 200</span>
                      <span>{Math.round((student.credits / 200) * 100)}%</span>
                    </div>
                    <Progress value={(student.credits / 200) * 100} className="h-1.5" />
                  </div>
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={student.status} />
                </td>
                <td className="px-5 py-4 text-right">
                  <Button variant="outline" size="sm" onClick={() => onSelect(student)} className="gap-1 border-slate-300 bg-white text-slate-800 hover:bg-slate-50">
                    จัดการ
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StudentWorkspaceGrid({
  students,
  selectedStudent,
  search,
  onSearch,
  onSelect,
  onOpenWorkspace,
}: {
  students: Student[];
  selectedStudent: Student;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (student: Student) => void;
  onOpenWorkspace: (student: Student) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-semibold">Workspace Student</h3>
          <p className="text-sm text-slate-500">ดูงานของนักเรียนแบบ preview เหมือนหน้า space หลัก พร้อมเปิดเข้าไปตรวจงานได้</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="ค้นหา workspace นักเรียน" className="h-10 bg-white pl-9 text-slate-950 placeholder:text-slate-400 sm:w-72" />
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {students.map((student) => {
          const active = student.code === selectedStudent.code;
          const progress = Math.round((student.credits / 200) * 100);
          return (
            <button
              key={student.code}
              type="button"
              onClick={() => {
                onSelect(student);
                onOpenWorkspace(student);
              }}
              className={cn(
                "group overflow-hidden rounded-lg border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                active ? "border-fuchsia-400 ring-2 ring-fuchsia-100" : "border-slate-200",
              )}
            >
              <div className="bg-slate-950 p-3 text-white">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{student.name} · {student.code}</div>
                    <div className="truncate text-xs text-slate-400">{student.assignment}</div>
                  </div>
                  <Eye className="h-4 w-4 text-slate-300" />
                </div>
                <div className="grid min-h-[190px] grid-cols-3 gap-2 rounded-md bg-[#090b10] p-3">
                  <WorkspaceMiniNode icon={FileText} title="Brief" />
                  <WorkspaceMiniNode icon={Image} title="Visual" highlight />
                  <WorkspaceMiniNode icon={Video} title="Draft" />
                  <div className="col-span-2 rounded-md border border-slate-800 bg-slate-900 p-3">
                    <div className="h-2 w-20 rounded-full bg-slate-700" />
                    <div className="mt-3 h-2 w-28 rounded-full bg-slate-800" />
                    <div className="mt-2 h-2 w-16 rounded-full bg-fuchsia-500/70" />
                  </div>
                  <WorkspaceMiniNode icon={ClipboardCheck} title="Review" highlight />
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-950">{student.workspaceTitle}</div>
                    <div className="truncate text-xs text-slate-500">{student.email}</div>
                  </div>
                  <StatusBadge status={student.status} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <SmallStat label="Credits" value={`${student.credits}/200`} />
                  <SmallStat label="Usage" value={`${progress}%`} />
                  <SmallStat label="Active" value={student.lastActive} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function WorkspaceMiniNode({ icon: Icon, title, highlight = false }: { icon: LucideIcon; title: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-md border p-3", highlight ? "border-fuchsia-400 bg-fuchsia-500/15" : "border-slate-800 bg-slate-900")}>
      <Icon className={cn("h-4 w-4", highlight ? "text-fuchsia-300" : "text-slate-400")} />
      <div className="mt-3 truncate text-xs font-medium text-slate-200">{title}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: StudentStatus }) {
  if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">รอยืนยัน</Badge>;
  if (status === "low_credit") return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">เครดิตต่ำ</Badge>;
  if (status === "suspended") return <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200">ระงับ</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">ใช้งานอยู่</Badge>;
}

function CreditModelCard({
  title,
  subtitle,
  selected,
  points,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  points: string[];
}) {
  return (
    <section className={cn("rounded-lg border bg-white p-5 shadow-sm", selected ? "border-fuchsia-300" : "border-slate-200")}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        {selected && <Badge className="bg-fuchsia-600">Active</Badge>}
      </div>
      <div className="space-y-3">
        {points.map((point) => (
          <div key={point} className="flex items-center gap-2 text-sm text-slate-600">
            <RefreshCw className="h-4 w-4 text-fuchsia-500" />
            {point}
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportTile({ icon: Icon, title, value }: { icon: LucideIcon; title: string; value: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="h-5 w-5 text-fuchsia-600" />
      <div className="mt-4 text-sm text-slate-500">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <Button variant="outline" className="mt-4 h-9 gap-2">
        <Download className="h-4 w-4" />
        Export
      </Button>
    </section>
  );
}

function AlertLine({ tone, text }: { tone: "amber" | "emerald" | "slate" | "fuchsia"; text: string }) {
  const toneClass = {
    amber: "bg-amber-50 text-amber-800",
    emerald: "bg-emerald-50 text-emerald-800",
    slate: "bg-slate-100 text-slate-700",
    fuchsia: "bg-fuchsia-50 text-fuchsia-800",
  }[tone];
  return <div className={cn("rounded-md px-3 py-2 text-sm", toneClass)}>{text}</div>;
}

function AddStudentDialog({
  open,
  onOpenChange,
  className,
  inviteEmail,
  studentCode,
  note,
  onEmailChange,
  onCodeChange,
  onNoteChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  inviteEmail: string;
  studentCode: string;
  note: string;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto border-slate-200 bg-white text-slate-950">
        <DialogHeader>
          <DialogTitle>เพิ่มนักเรียนเข้า {className}</DialogTitle>
          <DialogDescription>เพิ่มด้วย email และรหัสนักศึกษา หรือให้นักเรียนสแกน QR เพื่อสมัครเข้าคลาสเอง</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="student-email">Email นักเรียน</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="student-email"
                  value={inviteEmail}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="firstname.lastname@psc.ac.th"
                  className="h-11 pl-9"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="student-code">รหัสนักศึกษา</Label>
              <Input
                id="student-code"
                value={studentCode}
                onChange={(event) => onCodeChange(event.target.value)}
                placeholder="669020099"
                className="h-11 font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-note">หมายเหตุสำหรับอาจารย์</Label>
              <Textarea
                id="invite-note"
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
                placeholder="เช่น เพิ่มเข้ากลุ่มโปรเจกต์ Final Campaign"
                className="min-h-24"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onAdd} className="h-11 gap-2 bg-slate-950 text-white hover:bg-slate-800">
                <UserCheck className="h-4 w-4" />
                เพิ่มและส่ง Invite
              </Button>
              <Button variant="outline" className="h-11 gap-2">
                <Copy className="h-4 w-4" />
                คัดลอก invite link
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 text-sm font-semibold">QR สำหรับนักเรียน</div>
            <RealisticQr className="mx-auto h-48 w-48" />
            <div className="mt-3 rounded-md bg-white p-3 text-xs text-slate-600">
              นักเรียนสแกนแล้วกรอก email @psc.ac.th และรหัสนักศึกษา ระบบจะส่งคำขอให้อาจารย์อนุมัติ
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({
  open,
  onOpenChange,
  selectedClass,
  modelCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedClass: ClassItem;
  modelCopy: { title: string; detail: string };
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto border-slate-200 bg-white p-4 text-slate-950 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-fuchsia-600" />
            QR Code เข้าเรียน · {selectedClass.name}
          </DialogTitle>
          <DialogDescription>ใช้เปิดหน้าจอหน้าห้องเรียนหรือส่งให้นักเรียนเข้าคลาสด้วยตัวเอง</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
            <RealisticQr className="mx-auto h-52 w-52" />
            <div className="mt-3 rounded-md bg-white p-2 text-center font-mono text-xs text-slate-500">
              workspace.mediaforge.co/class/{selectedClass.code.toLowerCase()}
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">QR Code สำหรับเข้าคลาส</div>
              <div className="mt-1 text-2xl font-semibold">{selectedClass.name}</div>
              <div className="font-mono text-sm text-fuchsia-600">{selectedClass.code}-X8K9</div>
            </div>
            <QrRow label="เครดิตเริ่มต้นต่อนักเรียน" value={modelCopy.title} />
            <QrRow label="โมเดลการให้เครดิต" value={selectedClass.model} />
            <QrRow label="ระยะเวลา QR เปิด" value="15 นาที (เหลือ 12:34)" />
            <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">นักเรียนเข้าคลาสแล้ว 38 / 42</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="h-11 bg-slate-950 text-white hover:bg-slate-800">
                <Play className="mr-2 h-4 w-4" />
                โหมดฉายหน้าห้อง
              </Button>
              <Button variant="outline" className="h-11">
                <Copy className="mr-2 h-4 w-4" />
                คัดลอกลิงก์
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceDialog({ open, onOpenChange, student }: { open: boolean; onOpenChange: (open: boolean) => void; student: Student }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto border-slate-200 bg-white text-slate-950">
        <DialogHeader>
          <DialogTitle>Student Workspace · {student.name}</DialogTitle>
          <DialogDescription>{student.email} · {student.code} · {student.assignment}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-white">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-slate-400">Workspace Preview</div>
                <div className="text-xl font-semibold">{student.workspaceTitle}</div>
              </div>
              <Badge className="bg-emerald-500 text-white">Ready for review</Badge>
            </div>
            <div className="grid min-h-[360px] gap-4 rounded-lg bg-[#090b10] p-4 md:grid-cols-3">
              <CanvasNode icon={FileText} title="Prompt Brief" text="วิเคราะห์โจทย์และ tone of voice" />
              <CanvasNode icon={Image} title="Image Generator" text="4 variants generated" highlight />
              <CanvasNode icon={Video} title="Video Draft" text="15s concept board" />
              <div className="hidden md:block" />
              <CanvasNode icon={ClipboardCheck} title="Teacher Note" text="ตรวจ composition รอบสุดท้าย" />
              <CanvasNode icon={Laptop} title="Final Output" text="ส่งงานพร้อม export" highlight />
            </div>
          </div>
          <aside className="space-y-4">
            <SmallStat label="Credits remaining" value={`${student.credits} / 200`} />
            <SmallStat label="Attendance" value={`${student.attendance}%`} />
            <SmallStat label="Last active" value={student.lastActive} />
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="font-semibold">Teacher actions</div>
              <div className="mt-3 grid gap-2">
                <Button variant="outline" className="justify-start gap-2">
                  <Eye className="h-4 w-4" />
                  เปิดดูเต็มหน้าจอ
                </Button>
                <Button variant="outline" className="justify-start gap-2">
                  <WalletCards className="h-4 w-4" />
                  เพิ่มเครดิตเฉพาะคน
                </Button>
                <Button variant="outline" className="justify-start gap-2">
                  <MailCheck className="h-4 w-4" />
                  ส่ง feedback
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CanvasNode({ icon: Icon, title, text, highlight = false }: { icon: LucideIcon; title: string; text: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-4", highlight ? "border-fuchsia-400 bg-fuchsia-500/10" : "border-slate-800 bg-slate-900")}>
      <Icon className={cn("h-5 w-5", highlight ? "text-fuchsia-300" : "text-slate-400")} />
      <div className="mt-3 font-semibold">{title}</div>
      <div className="mt-1 text-sm text-slate-400">{text}</div>
    </div>
  );
}

function QrRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-slate-200 p-3">
      <Clock3 className="mt-0.5 h-4 w-4 text-fuchsia-600" />
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function RealisticQr({ className }: { className?: string }) {
  const finderAt = (x: number, y: number, originX: number, originY: number) => {
    const dx = x - originX;
    const dy = y - originY;
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false;
    return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
  };

  const cells = Array.from({ length: 29 * 29 }, (_, index) => {
    const x = index % 29;
    const y = Math.floor(index / 29);
    const inFinder = (x < 7 && y < 7) || (x > 21 && y < 7) || (x < 7 && y > 21);
    const finderInner = finderAt(x, y, 0, 0) || finderAt(x, y, 22, 0) || finderAt(x, y, 0, 22);
    const data = ((x * 7 + y * 11 + x * y) % 5 === 0) || ((x + y) % 7 === 0) || (x % 4 === 0 && y % 3 === 0);
    return finderInner || (!inFinder && data);
  });

  return (
    <div className={cn("grid grid-cols-[repeat(29,1fr)] gap-[2px] rounded-lg bg-white p-3 shadow-inner", className)}>
      {cells.map((filled, index) => (
        <span key={index} className={cn("aspect-square rounded-[1px]", filled ? "bg-slate-950" : "bg-white")} />
      ))}
    </div>
  );
}
