import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Upload, Trash2, Loader2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Document = {
  id: string;
  name: string;
  created_at: string;
  file_path: string;
};

const Documents = () => {
  const [docs, setDocs] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const { toast } = useToast();
  
  // Get the active workspace ID from local storage
  const workspaceId = localStorage.getItem("activeWorkspaceId");

  const fetchDocs = async () => {
    if (!workspaceId) return;
    
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching documents:", error);
    } else {
      setDocs(data as any || []);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [workspaceId]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Check if workspace is selected
    if (!workspaceId) {
      toast({
        title: "No Workspace Selected",
        description: "Please select a team/workspace from the sidebar dropdown first.",
        variant: "destructive",
      });
      return;
    }

    if (!uploadingFile) return;

    setIsUploading(true);
    try {
      const fileExt = uploadingFile.name.split('.').pop();
      const filePath = `${workspaceId}/${crypto.randomUUID()}.${fileExt}`;

      // 2. Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('workspace_docs')
        .upload(filePath, uploadingFile);

      if (uploadError) throw uploadError;

      // 3. Save metadata to DB and get the ID (Added .select().single())
      const { data: savedDoc, error: dbError } = await supabase.from("documents").insert({
        name: uploadingFile.name,
        workspace_id: workspaceId,
        file_path: filePath
      }).select().single();

      if (dbError) throw dbError;

      // 4. Trigger Edge Function for AI Processing (New Step)
      toast({ title: "Processing", description: "Generating AI embeddings..." });
      
      const { error: processError } = await supabase.functions.invoke("process-doc", {
        body: { 
          document_id: savedDoc.id, 
          file_path: filePath 
        }
      });

      if (processError) {
        console.error("Processing error:", processError);
        toast({ title: "Warning", description: "File saved, but AI processing failed.", variant: "destructive" });
      } else {
        toast({ title: "Success", description: "File processed for AI search!" });
      }

      setUploadingFile(null);
      
      // Reset file input
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      fetchDocs();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to upload file. Check storage permissions.", 
        variant: "destructive" 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const deleteDoc = async (id: string, path: string) => {
    // 1. Delete from DB
    const { error: dbError } = await supabase.from("documents").delete().eq("id", id);
    if (dbError) {
      toast({ title: "Error", description: "Failed to delete record", variant: "destructive" });
      return;
    }

    // 2. Delete from Storage
    const { error: storageError } = await supabase.storage.from('workspace_docs').remove([path]);
    if (storageError) console.error("Storage delete error:", storageError); // Non-blocking

    toast({ title: "Deleted", description: "Document removed." });
    fetchDocs();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Documents
        </h1>
      </div>

      {/* Upload Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Upload Document</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="flex gap-4 items-center">
            <Input 
              id="file-upload"
              type="file" 
              onChange={(e) => setUploadingFile(e.target.files?.[0] || null)}
              className="flex-1"
              accept=".pdf,.txt,.md,.doc,.docx"
            />
            <Button type="submit" disabled={isUploading || !uploadingFile}>
              {isUploading ? <Loader2 className="animate-spin w-4 h-4" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Document List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {docs.map((doc) => (
          <Card key={doc.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="truncate">
                  <p className="font-medium truncate" title={doc.name}>{doc.name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" title="View (Coming Soon)">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => deleteDoc(doc.id, doc.file_path)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {docs.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-10 border-2 border-dashed rounded-xl">
            No documents found. Upload one to get started.
          </div>
        )}
      </div>
    </div>
  );
};

export default Documents;