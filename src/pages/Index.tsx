import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, MessageSquare, Mic, Brain, Shield, Zap } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        navigate("/chat");
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-accent/5 to-background">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              USWA
            </span>
          </div>
          <Button onClick={() => navigate("/auth")}>Get Started</Button>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            Powered by Advanced AI
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold leading-tight">
            Your Intelligent{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Work Assistant
            </span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Experience the future of productivity with USWA - an AI-powered assistant that
            understands your needs, executes commands, and helps you work smarter.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" onClick={() => navigate("/auth")} className="text-lg">
              Start Free Trial
              <Sparkles className="w-5 h-5 ml-2" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/auth")}>
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {[
            {
              icon: MessageSquare,
              title: "Intelligent Chat",
              description: "Natural conversation with context-aware responses that understand your workflow.",
            },
            {
              icon: Mic,
              title: "Voice Commands",
              description: "Speak naturally and let AI transcribe and execute your instructions instantly.",
            },
            {
              icon: Brain,
              title: "Smart Automation",
              description: "AI analyzes patterns and suggests automations to save you time and effort.",
            },
            {
              icon: Zap,
              title: "Lightning Fast",
              description: "Optimized for speed with instant responses and real-time updates.",
            },
            {
              icon: Shield,
              title: "Secure & Private",
              description: "Your data is encrypted and protected with enterprise-grade security.",
            },
            {
              icon: Sparkles,
              title: "Always Learning",
              description: "Continuously improving from interactions to serve you better.",
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="p-6 rounded-xl border bg-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center space-y-6 p-12 rounded-2xl bg-gradient-to-r from-primary to-accent text-white">
          <h2 className="text-3xl md:text-4xl font-bold">
            Ready to Transform Your Workflow?
          </h2>
          <p className="text-lg opacity-90">
            Join thousands of professionals using USWA to work smarter, not harder.
          </p>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => navigate("/auth")}
            className="text-lg"
          >
            Get Started Now
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 USWA. Your intelligent work companion.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;