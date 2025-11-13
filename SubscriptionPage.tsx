
import React from 'react';

interface SubscriptionPlanProps {
  name: string;
  price: string;
  features: string[];
  isPopular?: boolean;
  onSelect: () => void;
}

const SubscriptionPlan: React.FC<SubscriptionPlanProps> = ({ name, price, features, isPopular, onSelect }) => {
  return (
    <div className={`relative flex flex-col p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border-2 ${isPopular ? 'border-indigo-500' : 'border-gray-200 dark:border-gray-700'}`}>
      {isPopular && (
        <div className="absolute top-0 -translate-y-1/2 px-4 py-1.5 text-sm font-semibold text-white bg-indigo-500 rounded-full shadow-md">
          Most Popular
        </div>
      )}
      <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">{name}</h3>
      <p className="mt-4">
        <span className="text-4xl font-bold text-gray-900 dark:text-white">${price}</span>
        <span className="ml-1 text-base font-medium text-gray-500 dark:text-gray-400">/ month</span>
      </p>
      <ul className="mt-6 space-y-4 text-gray-600 dark:text-gray-300 flex-grow">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <svg className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button 
        onClick={onSelect}
        className={`mt-8 w-full py-3 px-6 text-lg font-semibold rounded-lg transition-colors ${isPopular ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'}`}
      >
        Choose Plan
      </button>
    </div>
  );
};


interface SubscriptionPageProps {
  onSubscribe: () => void;
}

const SubscriptionPage: React.FC<SubscriptionPageProps> = ({ onSubscribe }) => {
  const plans = [
    {
      name: 'Hangeul Starter',
      price: '9',
      features: ['5 hours of AI call time', 'Basic conversation topics', 'Standard response speed', 'Email support'],
      isPopular: false,
    },
    {
      name: 'Seoul Speaker',
      price: '19',
      features: ['20 hours of AI call time', 'Expanded conversation topics', 'Faster response speed', 'Priority email support', 'Access to new voices'],
      isPopular: true,
    },
    {
      name: 'Korean Master',
      price: '49',
      features: ['Unlimited AI call time', 'All conversation topics', 'Instant response speed', '24/7 dedicated support', 'Beta feature access'],
      isPopular: false,
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="text-center max-w-3xl mx-auto">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-white">
          Become Fluent in Korean
        </h1>
        <p className="mt-4 text-lg sm:text-xl text-gray-600 dark:text-gray-400">
          Choose a plan that fits your learning pace. Start speaking with our advanced AI tutor today and accelerate your journey to fluency.
        </p>
      </div>

      <div className="mt-12 sm:mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {plans.map((plan) => (
          <SubscriptionPlan
            key={plan.name}
            name={plan.name}
            price={plan.price}
            features={plan.features}
            isPopular={plan.isPopular}
            onSelect={onSubscribe}
          />
        ))}
      </div>
    </div>
  );
};

export default SubscriptionPage;
