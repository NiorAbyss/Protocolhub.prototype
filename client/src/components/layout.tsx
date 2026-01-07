import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Github, PenTool } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-foreground selection:text-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container max-w-5xl mx-auto flex h-14 items-center px-4 sm:px-6">
          <div className="mr-4 hidden md:flex">
            <Link href="/" className="mr-6 flex items-center space-x-2 font-bold tracking-tighter">
              <span className="hidden font-bold sm:inline-block">BLOG.TEMPLATE</span>
            </Link>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <Link 
                href="/" 
                className={cn(
                  "transition-colors hover:text-foreground/80", 
                  location === "/" ? "text-foreground" : "text-foreground/60"
                )}
              >
                Home
              </Link>
              <Link 
                href="/about" 
                className={cn(
                  "transition-colors hover:text-foreground/80", 
                  location === "/about" ? "text-foreground" : "text-foreground/60"
                )}
              >
                About
              </Link>
            </nav>
          </div>
          
          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <div className="w-full flex-1 md:w-auto md:flex-none">
              {/* Optional search input could go here */}
            </div>
            <nav className="flex items-center space-x-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 px-0">
                <Github className="h-4 w-4" />
                <span className="sr-only">GitHub</span>
              </Button>
              <Link href="/create">
                <Button size="sm" className="h-8 gap-2">
                  <PenTool className="h-3.5 w-3.5" />
                  <span>Write</span>
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:py-12">
        {children}
      </main>
      <footer className="border-t py-6 md:py-0">
        <div className="container max-w-5xl mx-auto flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row px-4 sm:px-6">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            Built with React, Vite, Tailwind & Shadcn.
          </p>
        </div>
      </footer>
    </div>
  );
}
