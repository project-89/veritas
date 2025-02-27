import React from 'react';
import { Route, Routes } from 'react-router-dom';
import NarrativeVisualizationDemo from './NarrativeVisualizationDemo';
import './app.module.css';

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <div>
            <NarrativeVisualizationDemo />
          </div>
        }
      />
    </Routes>
  );
}

export default App;
