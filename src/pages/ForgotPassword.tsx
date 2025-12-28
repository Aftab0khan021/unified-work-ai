import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MailQuestion } from "lucide-react";

const ForgotPassword = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Check if the user exists using the database function we created
      const { data: userExists, error: checkError } = await supabase.rpc('check_email_exists', { 
        email_arg: email 
      });

      if (checkError) {
        throw new Error("Failed to verify email. Please try again.");
      }

      // 2. Logic: If user does NOT exist, show error.
      if (!userExists) {
        toast({
          title: "Account not found",
          description: "This email is not registered. Please sign up first.",
          variant: "destructive",
        });
        setIsLoading(false);
        return; // Stop here, do not send email
      }

      // 3. Logic: If user DOES exist, send the reset link.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      
      if (error) throw error;

      toast({
        title: "Reset link sent",
        description: "Please check your inbox (and spam folder) for the password reset link.",
      });
      
      // Redirect back to sign-in after 3 seconds
      setTimeout(() => navigate("/auth"), 3000);

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-accent/5 to-background p-4">
      <div className="w-full max-w-md">
        <Card className="border-2">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <MailQuestion className="w-12 h-12 text-primary" />
            </div>
            <CardTitle>Forgot Password</CardTitle>
            <CardDescription>Enter your email to receive a password reset link.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center border-t pt-4">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-2">
              &larr; Back to Sign In
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;