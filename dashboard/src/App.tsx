import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PipelinesPage } from "./pages/Pipelines";
import { PipelineDetailPage } from "./pages/PipelineDetail";
import { RunDetailPage } from "./pages/RunDetail";
import { CompareRunsPage } from "./pages/CompareRuns";
import { RunsExplorerPage } from "./pages/RunsExplorer";
import { StepsCatalogPage } from "./pages/StepsCatalog";
import { ArtifactsExplorerPage } from "./pages/ArtifactsExplorer";
import { SettingsPage } from "./pages/Settings";
import { WorkspacesPage } from "./pages/Workspaces";

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<PipelinesPage />} />
        <Route path="/runs" element={<RunsExplorerPage />} />
        <Route path="/artifacts" element={<ArtifactsExplorerPage />} />
        <Route path="/catalog/steps" element={<StepsCatalogPage />} />
        <Route path="/pipelines/:id" element={<PipelineDetailPage />} />
        <Route path="/pipelines/:id/compare" element={<CompareRunsPage />} />
        <Route path="/runs/:id" element={<RunDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/workspaces" element={<WorkspacesPage />} />
      </Routes>
    </Layout>
  );
}
