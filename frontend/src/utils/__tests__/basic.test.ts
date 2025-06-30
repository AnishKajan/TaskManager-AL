// src/utils/__tests__/basic.test.ts

// Add this line to make it a module
export {};

describe('Basic Test Setup', () => {
  it('should be able to run tests', () => {
    expect(true).toBe(true);
  });

  it('should have access to localStorage mock', () => {
    localStorage.setItem('test', 'value');
    expect(localStorage.setItem).toHaveBeenCalledWith('test', 'value');
  });

  it('should be able to test basic JavaScript functionality', () => {
    const add = (a: number, b: number) => a + b;
    expect(add(2, 3)).toBe(5);
  });
});