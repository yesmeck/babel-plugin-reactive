import { transformFileSync } from '@babel/core';
import * as path from 'path';
import plugin from '../src';

describe('babel-plugin-reactive', () => {
  it('works', () => {
    const result = transformFileSync(path.resolve(__dirname, './fixtures/simple.js'), {
      plugins: ['@babel/plugin-transform-react-jsx', [plugin]],
      babelrc: false,
    });
    expect(result!.code).toMatchSnapshot();
  });
});
