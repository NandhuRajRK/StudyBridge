import React, { createContext, useContext, useEffect, useState } from "react";
import { studybridge } from "@/api/studybridgeClient";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    setIsLoadingAuth(true);
    setAuthError(null);

    try {
      const currentUser = await studybridge.auth.me();
      setUser(currentUser);
      setIsAuthenticated(Boolean(currentUser));
    } catch (error) {
      setAuthError({
        type: "auth_required",
        message: error.message || "Authentication required",
      });
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const logout = async () => {
    await studybridge.auth.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => studybridge.auth.redirectToLogin();

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings: false,
        authError,
        appPublicSettings: null,
        logout,
        navigateToLogin,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
