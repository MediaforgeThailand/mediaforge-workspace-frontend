import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowUpRight, ArrowDownLeft, Loader2, Receipt, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import useDocumentTitle from "@/hooks/useDocumentTitle";

interface CreditTx { id: string; amount: number; type: string; description: string | null; feature: string | null; balance_after: number; created_at: string; }
interface PaymentTx { id: string; amount_thb: number; credits_added: number; status: string; payment_method: string | null; created_at: string; }

const Transactions = () => {
  useDocumentTitle("Usage — MediaForge");
  const { user } = useAuth();
  const { t } = useLanguage();
  const [creditTxs, setCreditTxs] = useState<CreditTx[]>([]);
  const [paymentTxs, setPaymentTxs] = useState<PaymentTx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) fetchAll(); }, [user]);

  const fetchAll = async () => {
    const [cRes, pRes] = await Promise.all([
      supabase.from("credit_transactions").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("payment_transactions").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setCreditTxs((cRes.data as CreditTx[]) || []);
    setPaymentTxs((pRes.data as PaymentTx[]) || []);
    setLoading(false);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold gradient-text">{t("transactions")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("transactionsDesc")}</p>
      </div>

      <Tabs defaultValue="credits" className="w-full">
        <TabsList className="bg-card/60 backdrop-blur-xl rounded-xl">
          <TabsTrigger value="credits" className="data-[state=active]:bg-primary/20"><Coins className="w-4 h-4 mr-1.5" /> {t("creditHistory")}</TabsTrigger>
          <TabsTrigger value="payments" className="data-[state=active]:bg-primary/20"><Receipt className="w-4 h-4 mr-1.5" /> {t("payments")}</TabsTrigger>
        </TabsList>

        <TabsContent value="credits" className="mt-4 space-y-2">
          {creditTxs.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">{t("noCreditTx")}</p>
          ) : creditTxs.map((tx) => (
            <Card key={tx.id} className="bg-card/60 backdrop-blur-xl border-border rounded-2xl shadow-xl shadow-black/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tx.amount > 0 ? "bg-primary/20" : "bg-destructive/20"}`}>
                  {tx.amount > 0 ? <ArrowDownLeft className="w-4 h-4 text-primary" /> : <ArrowUpRight className="w-4 h-4 text-destructive" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tx.description || tx.type}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${tx.amount > 0 ? "text-primary" : "text-destructive"}`}>{tx.amount > 0 ? "+" : ""}{tx.amount}</p>
                  <p className="text-[10px] text-muted-foreground">bal: {tx.balance_after}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="payments" className="mt-4 space-y-2">
          {paymentTxs.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">{t("noPayments")}</p>
          ) : paymentTxs.map((tx) => (
            <Card key={tx.id} className="bg-card/60 backdrop-blur-xl border-border rounded-2xl shadow-xl shadow-black/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/20">
                  <Receipt className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">฿{Number(tx.amount_thb).toLocaleString()} — {tx.credits_added.toLocaleString()} credits</p>
                  <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                </div>
                <Badge variant={tx.status === "completed" ? "default" : "outline"} className={tx.status === "completed" ? "bg-primary/20 text-primary border-primary/30" : ""}>{tx.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Transactions;
