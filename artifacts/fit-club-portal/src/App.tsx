import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";

import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Appointments from "@/pages/Appointments";
import Book from "@/pages/Book";
import Admin from "@/pages/Admin";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/fitclub-logo.png`,
  },
  variables: {
    colorPrimary: "hsl(46 63% 52%)",
    colorForeground: "hsl(0 0% 100%)",
    colorMutedForeground: "hsl(0 0% 60%)",
    colorDanger: "hsl(0 62.8% 40%)",
    colorBackground: "hsl(0 0% 10%)",
    colorInput: "hsl(0 0% 15%)",
    colorInputForeground: "hsl(0 0% 100%)",
    colorNeutral: "hsl(46 20% 25%)",
    fontFamily: "Plus Jakarta Sans, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(0,0%,10%)] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[hsl(46,20%,18%)] shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold font-display text-white",
    headerSubtitle: "text-sm text-gray-400",
    socialButtonsBlockButtonText: "font-semibold text-white",
    formFieldLabel: "font-semibold text-gray-300",
    footerActionLink: "font-semibold text-[hsl(46,63%,52%)] hover:text-[hsl(46,63%,45%)]",
    footerActionText: "text-gray-400",
    dividerText: "text-gray-500 font-medium",
    identityPreviewEditButton: "text-[hsl(46,63%,52%)] hover:text-[hsl(46,63%,45%)]",
    formFieldSuccessText: "text-green-500",
    alertText: "font-medium",
    logoBox: "h-12 flex justify-center mb-4",
    logoImage: "h-full w-auto",
    socialButtonsBlockButton: "border-[hsl(46,20%,25%)] hover:bg-[hsl(0,0%,15%)]",
    formButtonPrimary: "font-semibold shadow-sm text-black",
    formFieldInput: "bg-[hsl(0,0%,15%)] border-[hsl(46,20%,25%)] text-white focus:bg-[hsl(0,0%,18%)] focus:ring-[hsl(46,63%,52%)]",
    footerAction: "bg-[hsl(0,0%,8%)] border-t border-[hsl(46,20%,18%)]",
    dividerLine: "bg-[hsl(46,20%,25%)]",
    alert: "bg-red-950/50 border-red-900 text-red-200",
    otpCodeFieldInput: "border-[hsl(46,20%,25%)] text-white focus:ring-[hsl(46,63%,52%)]",
    formFieldRow: "mb-4",
    main: "px-8 py-6",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(0,0%,5%)] px-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[hsl(46,63%,52%,0.05)] rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[hsl(46,63%,52%,0.03)] rounded-full blur-3xl"></div>
      </div>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(0,0%,5%)] px-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[hsl(46,63%,52%,0.05)] rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[hsl(46,63%,52%,0.03)] rounded-full blur-3xl"></div>
      </div>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Access your Fit Club portal",
          },
        },
        signUp: {
          start: {
            title: "Join Fit Club",
            subtitle: "Create your member account",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          
          <Route path="/dashboard">
            <ProtectedRoute component={Dashboard} />
          </Route>
          
          <Route path="/appointments">
            <ProtectedRoute component={Appointments} />
          </Route>
          
          <Route path="/book">
            <ProtectedRoute component={Book} />
          </Route>

          <Route path="/admin">
            <ProtectedRoute component={Admin} />
          </Route>
          
          <Route>
            <div className="flex items-center justify-center min-h-[100dvh]">
              <div className="text-center">
                <h1 className="text-4xl font-display font-bold">404</h1>
                <p className="mt-2 text-muted-foreground">Page not found</p>
              </div>
            </div>
          </Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
