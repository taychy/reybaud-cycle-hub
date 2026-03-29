import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dumbbell, FileSpreadsheet } from "lucide-react";
import { ImportPlanContent } from "./ImportPlan";
import MonthOverview from "@/components/admin/trainings/MonthOverview";
import MonthDetail from "@/components/admin/trainings/MonthDetail";

const Trainings = () => {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
          Entrenamientos
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Planificación y gestión de entrenamientos
        </p>
      </div>

      <Tabs defaultValue="planificacion" className="w-full">
        <TabsList className="bg-secondary">
          <TabsTrigger value="planificacion" className="gap-1.5">
            <Dumbbell className="w-4 h-4" />
            Planificación
          </TabsTrigger>
          <TabsTrigger value="importar" className="gap-1.5">
            <FileSpreadsheet className="w-4 h-4" />
            Importar Plan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="planificacion" className="mt-4">
          {selectedMonth ? (
            <MonthDetail month={selectedMonth} onBack={() => setSelectedMonth(null)} />
          ) : (
            <MonthOverview onSelectMonth={setSelectedMonth} />
          )}
        </TabsContent>

        <TabsContent value="importar" className="mt-4">
          <ImportPlanContent />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Trainings;
