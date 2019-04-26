import React from 'react';

const App = () => {
  let count = 0;

  return (
    <button onClick={() => count += 1}>
      Clicked {count} {count === 1 ? 'time' : 'times'}
    </button>
  );
};

export default App;
