import React, { createContext, useEffect, useState, useContext } from 'react';
import NetInfo from '@react-native-community/netinfo';

interface NetworkContextProps {
  isConnected: boolean;
}

const NetworkContext = createContext<NetworkContextProps>({
  isConnected: true,
});

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected === false) {
        setIsConnected(false);
      } else {
        console.log('connected');
        setIsConnected(true);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <NetworkContext.Provider value={{ isConnected }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => useContext(NetworkContext);
