import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Upload, Trash2, Loader2, UserPlus, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type Document = {
  id: string;
  name: string;
  created_at: string;
  file_path: string;
  workspace_id: string;
  assignee_id?: string | null;
};

const Documents = () => {
  const [docs, setDocs] = useState<Document[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  
  const workspaceId = localStorage.getItem("activeWorkspaceId");

  const fetchDocs = async () => {
    if (!workspaceId) {
        setIsLoading(false);
        return;
    }
    
    try {
        const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("workspace_id", workspaceId) 
        .order("created_at", { ascending: false });

        if (error) throw error;
        setDocs(data as any || []);
    } catch (error: any) {
        console.error("Error fetching documents:", error);
        toast({ title: "Error", description: "Could not load documents", variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };

  const fetchMembers = async () => {
    if (!workspaceId) return;
    const { data } = await supabase
      .from("workspace_members")
      .select(`user_id, profiles:user_id(full_name)`)
      .eq("workspace_id", workspaceId);
    
    if (data) {
      setMembers(data.map((m: any) => ({
        id: m.user_id,
        name: m.profiles?.full_name || "Unknown"
      })));
    }
  };

  useEffect(() => {
    fetchDocs();
    fetchMembers();
  }, [workspaceId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!workspaceId) {
      toast({
        title: "No Workspace Selected",
        description: "Please select a team/workspace from the sidebar.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${workspaceId}/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('workspace_docs')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: savedDoc, error: dbError } = await supabase.from("documents").insert({
        name: file.name,
        workspace_id: workspaceId,
        file_path: filePath,
        content_text: "Processing...", 
      }).select().single();

      if (dbError) throw dbError;

      toast({ title: "File Uploaded", description: "AI is analyzing the content..." });

      const { error: processError } = await supabase.functions.invoke("process-doc", {
        body: { 
          document_id: savedDoc.id, 
          file_path: filePath 
        }
      });

      if (processError) {
        console.error("Processing error:", processError);
        toast({ title: "Warning", description: "File saved, but AI indexing failed.", variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Document indexed for chat!" });
      }

      e.target.value = '';
      fetchDocs(); 

    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to upload file.", 
        variant: "destructive" 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const deleteDoc = async (id: string, path: string) => {
    try {
        const { error: dbError } = await supabase.from("documents").delete().eq("id", id);
        if (dbError) throw dbError;

        await supabase.storage.from('workspace_docs').remove([path]);
        toast({ title: "Deleted", description: "Document removed." });
        fetchDocs();
    } catch (error: any) {
        toast({ title: "Error", description: "Failed to delete document.", variant: "destructive" });
    }
  };

  const handleAssign = async (docId: string, userId: string) => {
    const { error } = await supabase
        .from("documents")
        .update({ assignee_id: userId === "unassigned" ? null : userId })
        .eq("id", docId);
    
    if (error) {
        toast({ title: "Error", description: "Failed to assign document", variant: "destructive" });
    } else {
        toast({ title: "Success", description: "Document shared!" });
        fetchDocs();
    }
  };

  const isImage = (name: string) => /\.(jpg|jpeg|png|webp|gif)$/i.test(name);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Documents
        </h1>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Upload Document or Image</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <Input 
              id="file-upload"
              type="file" 
              onChange={handleUpload}
              className="flex-1"
              // FIX: Added image extensions to accept
              accept=".pdf,.txt,.md,.doc,.docx,.jpg,.jpeg,.png,.webp"
              disabled={isUploading}
            />
            
            <Button disabled={isUploading} className="min-w-[120px]">
              {isUploading ? <Loader2 className="animate-spin w-4 h-4" /> : <Upload className="w-4 h-4 mr-2" />}
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <p className="text-muted-foreground col-span-full text-center">Loading documents...</p>}
        
        {!isLoading && docs.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-10 border-2 border-dashed rounded-xl">
            No documents found. Upload a PDF or Image to start!
          </div>
        )}

        {docs.map((doc) => (
          <Card key={doc.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  {isImage(doc.name) ? <ImageIcon className="w-5 h-5 text-purple-500" /> : <FileText className="w-5 h-5 text-primary" />}
                </div>
                <div className="truncate max-w-[120px]">
                  <p className="font-medium truncate" title={doc.name || doc.file_path}>{doc.name || doc.file_path.split('/').pop()}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" title="Share Document">
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Share Document</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                       <div className="grid gap-2">
                         <Label>Assign to Member</Label>
                         <Select onValueChange={(val) => handleAssign(doc.id, val)} defaultValue={doc.assignee_id || "unassigned"}>
                            <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                            </SelectContent>
                         </Select>
                         <p className="text-xs text-muted-foreground">
                           Assigned user will be able to see and chat with this document.
                         </p>
                       </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button variant="ghost" size="icon" onClick={() => deleteDoc(doc.id, doc.file_path)}>
                  <Trash2 className="w-4 h-4 text-destructive opacity-70 hover:opacity-100" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Documents;