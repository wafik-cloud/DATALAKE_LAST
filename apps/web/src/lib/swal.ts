import Swal from 'sweetalert2';

const baseOptions = {
  confirmButtonColor: '#4a78a5',
  cancelButtonColor: '#64748b',
  customClass: {
    popup: 'swal-institutional',
    title: 'swal-institutional-title',
    confirmButton: 'swal-btn-confirm',
    cancelButton: 'swal-btn-cancel',
  },
};

export async function confirmAction(
  title: string,
  text: string,
  confirmText = 'Confirmer'
): Promise<boolean> {
  const result = await Swal.fire({
    ...baseOptions,
    title,
    text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Annuler',
    reverseButtons: true,
  });
  return result.isConfirmed;
}

export async function showSuccess(title: string, text?: string) {
  await Swal.fire({
    ...baseOptions,
    title,
    text,
    icon: 'success',
    timer: 2800,
    showConfirmButton: false,
  });
}

export async function showError(title: string, text?: string) {
  await Swal.fire({
    ...baseOptions,
    title,
    text,
    icon: 'error',
    confirmButtonText: 'Fermer',
  });
}

export async function showInfo(title: string, text?: string) {
  await Swal.fire({
    ...baseOptions,
    title,
    text,
    icon: 'info',
    confirmButtonText: 'OK',
  });
}

export function showLoading(title = 'Traitement en cours…', text = 'Veuillez patienter') {
  Swal.fire({
    ...baseOptions,
    title,
    text,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
}

export function closeLoading() {
  Swal.close();
}

export async function withLoading<T>(
  task: () => Promise<T>,
  title = 'Traitement en cours…',
  text = 'Veuillez patienter'
): Promise<T> {
  showLoading(title, text);
  try {
    return await task();
  } finally {
    closeLoading();
  }
}
