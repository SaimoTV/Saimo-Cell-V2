import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const CHAVE = 'apoieVistoNaVersao';

/**
 * A tela de Apoie abre uma vez por versão: no primeiro uso do app e depois de
 * cada atualização. Devolve verdadeiro só na primeira vez que a versão atual
 * pergunta, e já marca como vista (fechar o app no meio não repete).
 */
export async function deveMostrarApoie(): Promise<boolean> {
  // No iOS a doação por link externo (Pix/cripto) não passa na revisão da App Store.
  if (Platform.OS === 'ios') return false;
  const versao = Constants.expoConfig?.version ?? Constants.nativeApplicationVersion ?? '0.0.0';
  try {
    if ((await AsyncStorage.getItem(CHAVE)) === versao) return false;
    await AsyncStorage.setItem(CHAVE, versao);
    return true;
  } catch {
    return false;
  }
}
