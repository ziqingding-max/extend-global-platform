import { workerTrpc } from "@/lib/workerTrpc";
import WorkerLayout from "./WorkerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FolderOpen, FileText, ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function WorkerDocuments() {
  const { data: docsData, isLoading: docsLoading } = workerTrpc.documents.listDocuments.useQuery();
  const { data: contractsData, isLoading: contractsLoading } = workerTrpc.documents.listContracts.useQuery();

  const isLoading = docsLoading || contractsLoading;

  return (
    <WorkerLayout>
      <div className="space-y-4 md:space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Documents</h1>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="documents" className="w-full">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="documents" className="flex-1 sm:flex-none">
                Documents ({docsData?.documents?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="contracts" className="flex-1 sm:flex-none">
                Contracts ({contractsData?.contracts?.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="documents" className="mt-4">
              {(!docsData?.documents || docsData.documents.length === 0) ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No documents available.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {docsData.documents.map((doc: any) => (
                    <Card key={doc.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                              <FileText className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{doc.documentName}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700">
                                  {doc.documentType}
                                </span>
                                {doc.mimeType && (
                                  <span className="text-xs text-muted-foreground">{doc.mimeType}</span>
                                )}
                                {doc.fileSize && (
                                  <span className="text-xs text-muted-foreground">
                                    {(doc.fileSize / 1024).toFixed(1)} KB
                                  </span>
                                )}
                              </div>
                              {doc.notes && (
                                <p className="text-sm text-muted-foreground mt-1">{doc.notes}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                Uploaded: {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : "--"}
                              </p>
                            </div>
                          </div>
                          {doc.fileUrl && (
                            <a
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 p-2 text-primary hover:bg-primary/10 rounded-md transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="contracts" className="mt-4">
              {(!contractsData?.contracts || contractsData.contracts.length === 0) ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No contracts available.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {contractsData.contracts.map((contract: any) => (
                    <Card key={`${contract.source}-${contract.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium">{contract.contractType}</p>
                              {contract.status && <ContractStatusBadge status={contract.status} />}
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                              {contract.effectiveDate && (
                                <span>Effective: {contract.effectiveDate}</span>
                              )}
                              {contract.expiryDate && (
                                <span>Expires: {contract.expiryDate}</span>
                              )}
                              {contract.signedDate && (
                                <span>Signed: {contract.signedDate}</span>
                              )}
                              {!contract.effectiveDate && !contract.expiryDate && !contract.signedDate && contract.createdAt && (
                                <span>Uploaded: {new Date(contract.createdAt).toLocaleDateString()}</span>
                              )}
                              {contract.notes && (
                                <span>{contract.notes}</span>
                              )}
                            </div>
                          </div>
                          {contract.fileUrl && (
                            <a
                              href={contract.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 p-2 text-primary hover:bg-primary/10 rounded-md transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </WorkerLayout>
  );
}

function ContractStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    active: "bg-green-100 text-green-700",
    expired: "bg-orange-100 text-orange-700",
    terminated: "bg-red-100 text-red-700",
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[status] || "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}
