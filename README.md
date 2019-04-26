# babel-plugin-reactive

Make React reactive again!

### In

```javascript
import React from 'react';

export default () => {
  let count = 0;

  return (
    <button onClick={() => count += 1}>
      Clicked {count} {count === 1 ? 'time' : 'times'}
    </button>
  );
};
```

### Out

```javascript
import React, { useState } from 'react';

export default () => {
  let [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(_count => _count + 1)}>
      Clicked {count} {count === 1 ? 'time' : 'times'}
    </button>
  );
};
```

## License

[MIT](LICENSE)
