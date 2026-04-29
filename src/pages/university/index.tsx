import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  GraduationCap,
  MailCheck,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type StudentStatus = "active" | "waiting" | "suspended";

const students: Array<{
  initials: string;
  name: string;
  code: string;
  credits: number;
  status: StudentStatus;
  lastAction: string;
}> = [
  { initials: "สช", name: "สมชาย ใจดี", code: "6612345", credits: 150, status: "active", lastAction: "สร้างภาพประกอบ" },
  { initials: "มล", name: "มาลี สุขใจ", code: "6612346", credits: 60, status: "active", lastAction: "ตัดต่อวิดีโอ" },
  { initials: "วร", name: "วรเดช มั่นคง", code: "6612347", credits: 190, status: "active", lastAction: "เขียนสคริปต์" },
  { initials: "ปท", name: "ปทุม ทองดี", code: "6612348", credits: 20, status: "waiting", lastAction: "รอเครดิตเพิ่ม" },
  { initials: "ณภ", name: "ณภัทร ศิลป์ชัย", code: "6612349", credits: 0, status: "suspended", lastAction: "พักการใช้งาน" },
];

const classes = [
  { name: "Digital Media", term: "ภาคเรียนที่ 1 ปีการศึกษา 2569", students: 42, used: 5750, total: 20000, model: "Monthly Reset" },
  { name: "Motion Design Workshop", term: "หลักสูตรพิเศษ 8 สัปดาห์", students: 28, used: 2440, total: 11200, model: "Weekly Drip" },
  { name: "AI Content Studio", term: "โครงการเสริมทักษะ", students: 35, used: 3180, total: 14000, model: "Weekly Drip" },
];

const weeklyDrip = [50, 100, 150, 200, 250, 300, 350, 400];
const dmdLogoSrc = "/dmd-digital-media-logo.png";

export default function UniversityMockup() {
  const [selectedClass, setSelectedClass] = useState(classes[0]);
  const [qrOpen, setQrOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(students[0]);

  const remaining = selectedClass.total - selectedClass.used;
  const usedPercent = Math.round((selectedClass.used / selectedClass.total) * 100);
  const average = Math.round(selectedClass.used / selectedClass.students);

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

  return (
    <div className="min-h-full overflow-x-hidden bg-[#f6f7fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-5 lg:px-6 lg:py-4">
          <div className="flex min-w-0 items-center gap-4">
            <img
              src={dmdLogoSrc}
              alt="DMD"
              className="h-12 w-[132px] shrink-0 object-contain sm:w-[156px]"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">PSC College Management</h1>
                <Badge className="bg-fuchsia-600 text-white hover:bg-fuchsia-600">DMD</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Digital Media Design · MediaForge for Education
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <Button variant="outline" className="h-11 gap-2">
              <Download className="h-4 w-4" />
              ส่งออกรายงาน
            </Button>
            <Button className="h-11 gap-2 bg-slate-950 text-white hover:bg-slate-800">
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
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-2">
            <Button variant="outline" className="h-11 gap-2">
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

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-5 lg:gap-6 lg:px-6 lg:py-6 xl:grid-cols-[280px_minmax(0,1fr)]">
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
            <div className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              คลาสของฉัน
            </div>
            <div className="space-y-1">
              {classes.map((item) => {
                const active = item.name === selectedClass.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setSelectedClass(item)}
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
              Domain Gate
            </div>
            <div className="space-y-3 text-sm text-slate-600">
              <FlowStep icon={ScanLine} label="สแกน QR" />
              <FlowStep icon={MailCheck} label="ยืนยันด้วยอีเมล @psc.com" />
              <FlowStep icon={CheckCircle2} label="เข้าคลาสและรับเครดิต" />
            </div>
          </section>
        </aside>

        <section className="min-w-0 space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <GraduationCap className="h-4 w-4" />
                  {selectedClass.term}
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">{selectedClass.name}</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">
                  {modelCopy.title} · {modelCopy.detail}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="h-11 gap-2">
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
            <Metric icon={Users} label="นักเรียนทั้งหมด" value={String(selectedClass.students)} hint="+3 สัปดาห์นี้" />
            <Metric icon={WalletCards} label="เครดิตคงเหลือ" value={remaining.toLocaleString()} hint={`จาก ${selectedClass.total.toLocaleString()}`} />
            <Metric icon={Activity} label="การใช้งานเดือนนี้" value={selectedClass.used.toLocaleString()} hint={`เฉลี่ย ${average}/คน`} />
            <Metric icon={Sparkles} label="โมเดลเครดิต" value={selectedClass.model} hint={selectedClass.model === "Monthly Reset" ? "รีเซ็ตทุกเดือน" : "สะสมรายสัปดาห์"} />
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200">
              <TabsTrigger value="overview" className="min-h-11 min-w-24 px-4">หน้าแรก</TabsTrigger>
              <TabsTrigger value="students" className="min-h-11 min-w-24 px-4">นักเรียน</TabsTrigger>
              <TabsTrigger value="credits" className="min-h-11 min-w-24 px-4">เครดิต</TabsTrigger>
              <TabsTrigger value="reports" className="min-h-11 min-w-24 px-4">รายงาน</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="m-0 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Credit Overview</h3>
                    <p className="text-sm text-slate-500">การใช้เครดิตของคลาสปัจจุบัน</p>
                  </div>
                  <Badge variant="outline">{usedPercent}% used</Badge>
                </div>
                <Progress value={usedPercent} className="h-2" />
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <SmallStat label="ใช้ไป" value={selectedClass.used.toLocaleString()} />
                  <SmallStat label="เหลือ" value={remaining.toLocaleString()} />
                  <SmallStat label="วงเงินคลาส" value={selectedClass.total.toLocaleString()} />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold">Recent Activity</h3>
                <div className="mt-4 space-y-3">
                  {students.slice(0, 4).map((student) => (
                    <button
                      key={student.code}
                      type="button"
                      onClick={() => setSelectedStudent(student)}
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
              <StudentTable selectedStudent={selectedStudent} onSelect={setSelectedStudent} />
            </TabsContent>

            <TabsContent value="credits" className="m-0 grid gap-4 xl:grid-cols-2">
              <CreditModelCard
                title="Monthly Reset Quota"
                subtitle="200 เครดิต / เดือน / นักเรียน"
                selected={selectedClass.model === "Monthly Reset"}
                points={["คาดเดาต้นทุนได้ 100%", "รีเซ็ตอัตโนมัติทุกวันที่ 1", "ใช้ไม่หมดไม่ทบ"]}
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
                  {weeklyDrip.map((value, index) => (
                    <div key={value} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="w-full rounded-t-md bg-fuchsia-500"
                        style={{ height: `${(value / 400) * 150}px` }}
                      />
                      <span className="text-[11px] text-slate-500">W{index + 1}</span>
                    </div>
                  ))}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="reports" className="m-0 grid gap-4 md:grid-cols-3">
              <ReportTile icon={BarChart3} title="การใช้งานรายเดือน" value="5,750 credits" />
              <ReportTile icon={CircleDollarSign} title="งบประมาณคงเหลือ" value="14,250 credits" />
              <ReportTile icon={CalendarClock} title="รอบเครดิตถัดไป" value="1 พ.ค. 2569" />
            </TabsContent>
          </Tabs>
        </section>
      </main>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto border-slate-200 bg-white p-4 text-slate-950 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 pr-8">
              <span>เริ่มคาบเรียน · {selectedClass.name}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              <div className="grid aspect-square place-items-center rounded-md bg-white shadow-inner">
                <div className="grid h-36 w-36 grid-cols-5 gap-1">
                  {Array.from({ length: 25 }).map((_, index) => (
                    <span
                      key={index}
                      className={cn(
                        "rounded-[2px]",
                        [0, 1, 3, 5, 6, 7, 10, 12, 14, 17, 18, 20, 21, 23, 24].includes(index)
                          ? "bg-slate-950"
                          : "bg-slate-200",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">QR Code สำหรับเข้าคลาส</div>
                <div className="mt-1 text-2xl font-semibold">{selectedClass.name}</div>
                <div className="font-mono text-sm text-fuchsia-600">DM-2026-X8K9</div>
              </div>
              <QrRow label="เครดิตเริ่มต้นต่อนักเรียน" value={modelCopy.title} />
              <QrRow label="โมเดลการให้เครดิต" value={selectedClass.model} />
              <QrRow label="ระยะเวลา QR เปิด" value="15 นาที (เหลือ 12:34)" />
              <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                นักเรียนเข้าคลาสแล้ว 38 / 42
              </div>
              <Button className="h-11 w-full bg-slate-950 text-white hover:bg-slate-800">
                ฉายหน้าจอนี้บนโปรเจคเตอร์
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: string; hint: string }) {
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

function FlowStep({ icon: Icon, label }: { icon: typeof ScanLine; label: string }) {
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

function AvatarText({ children }: { children: string }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-semibold text-white">
      {children}
    </span>
  );
}

function StudentTable({
  selectedStudent,
  onSelect,
}: {
  selectedStudent: (typeof students)[number];
  onSelect: (student: (typeof students)[number]) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">หน้าจัดการนักเรียน</h3>
          <p className="text-sm text-slate-500">เพิ่ม ลบ ระงับ หรือปรับเครดิตนักเรียนแต่ละคน</p>
        </div>
        <div className="rounded-md bg-fuchsia-50 px-3 py-2 text-sm text-fuchsia-700">
          กำลังจัดการ: {selectedStudent.name}
        </div>
      </div>
      <div className="divide-y divide-slate-100 lg:hidden">
        {students.map((student) => (
          <button
            key={student.code}
            type="button"
            onClick={() => onSelect(student)}
            className="flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
          >
            <AvatarText>{student.initials}</AvatarText>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{student.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono">{student.code}</span>
                <span>{student.credits} / 200 credits</span>
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
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-5 py-3 text-left">นักเรียน</th>
              <th className="px-5 py-3 text-left">รหัส</th>
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
                      <div className="text-xs text-slate-500">{student.lastAction}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 font-mono text-slate-600">{student.code}</td>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSelect(student)}
                    className="gap-1"
                  >
                    จัดการ
                    <ChevronRight className="h-3.5 w-3.5" />
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

function StatusBadge({ status }: { status: StudentStatus }) {
  if (status === "waiting") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">รอเครดิตเพิ่ม</Badge>;
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

function ReportTile({ icon: Icon, title, value }: { icon: typeof BarChart3; title: string; value: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="h-5 w-5 text-fuchsia-600" />
      <div className="mt-4 text-sm text-slate-500">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </section>
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
