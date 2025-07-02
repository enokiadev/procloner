import { useState, useCallback } from 'react';
import { logger } from '../utils/logger';

interface ErrorState {
  error: Error | null;
  isError: boolean;
  errorMessage: string;
}

interface UseErrorHandlerReturn extends ErrorState {
  clearError: () => void;
  handleError: (error: Error | string, context?: Record<string, any>) => void;
  withErrorHandling: <T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    context?: Record<string, any>
  ) => (...args: T) => Promise<R | undefined>;
}

export const useErrorHandler = (component?: string): UseErrorHandlerReturn => {
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isError: false,
    errorMessage: ''
  });

  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      isError: false,
      errorMessage: ''
    });
  }, []);

  const handleError = useCallback((error: Error | string, context?: Record<string, any>) => {
    const errorObj = error instanceof Error ? error : new Error(error);
    const message = errorObj.message || 'An unexpected error occurred';
    
    logger.error(`Error in ${component || 'component'}`, {
      component,
      error: errorObj.message,
      stack: errorObj.stack,
      ...context
    });

    setErrorState({
      error: errorObj,
      isError: true,
      errorMessage: message
    });
  }, [component]);

  const withErrorHandling = useCallback(<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    context?: Record<string, any>
  ) => {
    return async (...args: T): Promise<R | undefined> => {
      try {
        clearError();
        return await fn(...args);
      } catch (error) {
        handleError(error as Error, context);
        return undefined;
      }
    };
  }, [handleError, clearError]);

  return {
    ...errorState,
    clearError,
    handleError,
    withErrorHandling
  };
};

// Hook for API calls with automatic error handling
export const useApiCall = <T = any>(component?: string) => {
  const { handleError, withErrorHandling, ...errorState } = useErrorHandler(component);
  
  const apiCall = useCallback(async (
    url: string,
    options?: RequestInit,
    context?: Record<string, any>
  ): Promise<T | undefined> => {
    const method = options?.method || 'GET';
    
    logger.debug(`API call started`, { 
      component, 
      method, 
      url,
      ...context 
    });

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      
      logger.debug(`API call succeeded`, {
        component,
        method,
        url,
        status: response.status,
        ...context
      });
      
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error';
      
      logger.error(`API call failed`, {
        component,
        method,
        url,
        error: errorMessage,
        ...context
      });
      
      handleError(error as Error, { method, url, ...context });
      return undefined;
    }
  }, [component, handleError]);

  return {
    ...errorState,
    apiCall,
    handleError,
    withErrorHandling
  };
};