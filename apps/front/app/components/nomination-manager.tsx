import type {MovieDetails} from '../routes/admin.movies.$id';
import {AddNominationForm} from './admin/nominations/add-nomination-form';
import {EditNominationForm} from './admin/nominations/edit-nomination-form';
import {NominationTable} from './admin/nominations/nomination-table';
import type {Nomination} from './admin/nominations/types';
import {useAwardsData} from './admin/nominations/use-awards-data';
import {useNominationEditor} from './admin/nominations/use-nomination-editor';

type NominationManagerProperties = {
  movieId: string;
  apiUrl: string;
  nominations: Nomination[];
  onNominationsUpdate: (movieData: MovieDetails) => void;
};

export default function NominationManager({
  movieId,
  apiUrl,
  nominations,
  onNominationsUpdate,
}: NominationManagerProperties) {
  const {awardsData, loadingAwards, awardsError} = useAwardsData(apiUrl);

  const {
    showAddForm,
    newNomination,
    isAdding,
    editingNominationId,
    editValues,
    isUpdating,
    deletingNominationId,
    error: nominationError,
    toggleAddForm,
    closeAddForm,
    changeOrganization,
    changeNewNomination,
    handleAddNomination,
    handleStartEdit,
    changeEditValues,
    cancelEdit,
    handleUpdateNomination,
    handleDeleteNomination,
  } = useNominationEditor({movieId, apiUrl, nominations, onNominationsUpdate});

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">ノミネート管理</h3>
        <button
          type="button"
          onClick={toggleAddForm}
          className="bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-blue-700"
          disabled={loadingAwards}>
          {showAddForm ? 'キャンセル' : 'ノミネートを追加'}
        </button>
      </div>

      {awardsError && (
        <p className="mb-4 text-sm text-red-600">{awardsError}</p>
      )}

      {nominationError && (
        <p className="mb-4 text-sm text-red-600">{nominationError}</p>
      )}

      {showAddForm && (
        <AddNominationForm
          awardsData={awardsData}
          loadingAwards={loadingAwards}
          values={newNomination}
          isAdding={isAdding}
          onOrganizationChange={changeOrganization}
          onChange={changeNewNomination}
          onSubmit={handleAddNomination}
          onCancel={closeAddForm}
        />
      )}

      <div className="overflow-x-auto">
        <NominationTable
          nominations={nominations}
          deletingNominationId={deletingNominationId}
          onEdit={handleStartEdit}
          onDelete={handleDeleteNomination}
        />
      </div>

      {editingNominationId && (
        <EditNominationForm
          values={editValues}
          isUpdating={isUpdating}
          onChange={changeEditValues}
          onSubmit={handleUpdateNomination}
          onCancel={cancelEdit}
        />
      )}
    </div>
  );
}
