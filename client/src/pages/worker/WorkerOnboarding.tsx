import { workerTrpc } from "@/lib/workerTrpc";
import WorkerLayout from "./WorkerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WorkerOnboarding() {
  return (
    <WorkerLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Onboarding</h1>
        <Card>
          <CardHeader>
            <CardTitle>Welcome Aboard</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Onboarding steps will appear here.</p>
          </CardContent>
        </Card>
      </div>
    </WorkerLayout>
  );
}
