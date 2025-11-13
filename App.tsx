
import React, { useState, useCallback } from 'react';
import SubscriptionPage from './components/SubscriptionPage';
import CallPage from './components/CallPage';

const App: React.FC = () => {
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleSubscribe = useCallback(() => {
    setIsSubscribed(true);
  }, []);

  return (
    <div className="min-h-screen font-sans text-gray-800 dark:text-gray-200">
      {isSubscribed ? (
        <CallPage />
      ) : (
        <SubscriptionPage onSubscribe={handleSubscribe} />
      )}
    </div>
  );
};

export default App;
