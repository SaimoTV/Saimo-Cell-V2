import React, { useEffect, useState, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  Animated, 
  Platform, 
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { ultimaAtualizacao, urlDeDownloadPermitida, registrarVerificador, type ResultadoChecagem } from '../services/atualizacao';
import { Colors } from '../constants/Colors'; // Assuming Colors is present, else we can fall back

/// Com o app aberto, olha de novo ao voltar para a frente, no máximo a cada 6 h.
const INTERVALO_MS = 6 * 60 * 60 * 1000;

interface UpdateInfo {
  version: string;
  url: string;
  releaseNotes: string;
  mandatory: boolean;
}

export default function Updater() {
  const [visible, setVisible] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  
  const scaleValue = useRef(new Animated.Value(0.9)).current;
  const opacityValue = useRef(new Animated.Value(0)).current;

  // A versão vem do próprio app (app.json embutido no build). Escrita à mão
  // aqui ela ficou para trás (2.0.6 no app 2.1.0) e o aviso de atualização
  // aparecia sem parar, oferecendo a versão que a pessoa já tinha.
  const currentVersion = Constants.expoConfig?.version ?? Constants.nativeApplicationVersion ?? '0.0.0';

  const ultimaChecagem = useRef(0);

  const checkUpdate = useCallback(async (): Promise<ResultadoChecagem> => {
    try {
      ultimaChecagem.current = Date.now();
      const release = await ultimaAtualizacao();
      if (!release) return 'erro';
      const { version } = release;
      const data: UpdateInfo = {
        version,
        url: release.url,
        releaseNotes: release.notas,
        mandatory: false,
      };

      if (compareVersions(version, currentVersion) > 0) {
        setUpdateInfo(data);
        setVisible(true);
        Animated.parallel([
          Animated.timing(scaleValue, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacityValue, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          })
        ]).start();
        return 'nova';
      }
      return 'atual';
    } catch (error) {
      console.log('Update check failed:', error);
      return 'erro';
    }
  }, [currentVersion]);

  // O botão "Verificar atualizações" dos Ajustes usa esta mesma checagem.
  useEffect(() => {
    registrarVerificador(checkUpdate);
    return () => registrarVerificador(null);
  }, [checkUpdate]);

  // Dez segundos depois de abrir: nos primeiros instantes a rede é dos
  // canais e do guia, e o aviso de versão nova pode esperar.
  useEffect(() => {
    const espera = setTimeout(checkUpdate, 10_000);
    return () => clearTimeout(espera);
  }, [checkUpdate]);

  // Quem deixa o app aberto dias seguidos também fica sabendo da versão nova.
  useEffect(() => {
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' && !visible && Date.now() - ultimaChecagem.current > INTERVALO_MS) checkUpdate();
    });
    return () => assinatura.remove();
  }, [checkUpdate, visible]);

  const compareVersions = (v1: string, v2: string) => {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const p1 = v1Parts[i] || 0;
        const p2 = v2Parts[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
  };

  const handleDownload = async () => {
    if (!updateInfo || !urlDeDownloadPermitida(updateInfo.url)) return;
    setIsDownloading(true);
    setErro(null);
    setDownloadProgress(0);
    try {
      const apkUri = FileSystem.documentDirectory + 'update.apk';
      const downloadResumable = FileSystem.createDownloadResumable(
        updateInfo.url,
        apkUri,
        {},
        (dp) => {
          if (dp.totalBytesExpectedToWrite > 0) {
            setDownloadProgress(Math.min(1, dp.totalBytesWritten / dp.totalBytesExpectedToWrite));
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result || result.status >= 400) throw new Error(`HTTP ${result?.status ?? '?'}`);
      await installApk(result.uri);
    } catch (e) {
      setIsDownloading(false);
      setErro('Não foi possível baixar ou abrir o instalador. Verifique a internet e tente de novo.');
    }
  };

  const installApk = async (uri: string) => {
    if (Platform.OS === 'android') {
      const cUri = await FileSystem.getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: cUri,
        flags: 1,
        type: 'application/vnd.android.package-archive',
      });
      setVisible(false);
    }
    setIsDownloading(false);
  };

  const handleClose = () => {
    // Only allow skipping if it's not a mandatory update
    if (!updateInfo?.mandatory) {
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <Animated.View style={[
          styles.modalContainer,
          {
            opacity: opacityValue,
            transform: [{ scale: scaleValue }]
          }
        ]}>
          <View style={styles.iconContainer}>
            <Ionicons name="cloud-download-outline" size={48} color="#FFD700" />
          </View>
          
          <Text style={styles.title}>Nova Atualização Disponível</Text>
          <Text style={styles.versionText}>
            Versão {updateInfo?.version} já está disponível (Atual: {currentVersion})
          </Text>
          
          {/* Notas longas rolam aqui dentro: os botões ficam sempre à vista. */}
          <ScrollView style={styles.notes} contentContainerStyle={styles.notesContent}>
            <Text style={styles.description}>
              {updateInfo?.releaseNotes || "Melhorias de desempenho e correções de bugs."}
            </Text>
          </ScrollView>

          {erro && <Text style={styles.errorText}>{erro}</Text>}

          {isDownloading ? (
            <View style={styles.progressContainer}>
              <Text style={styles.progressText}>Baixando... {Math.round(downloadProgress * 100)}%</Text>
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${downloadProgress * 100}%` }]} />
              </View>
              <ActivityIndicator size="small" color="#FFD700" style={{ marginTop: 10 }} />
            </View>
          ) : (
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={handleDownload}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>Atualizar Agora</Text>
              </TouchableOpacity>
              
              {!updateInfo?.mandatory && (
                <TouchableOpacity
                  style={[styles.button, styles.secondaryButton]}
                  onPress={handleClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.secondaryButtonText}>Mais Tarde</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  versionText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 16,
    textAlign: 'center',
  },
  notes: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 260,
    marginBottom: 20,
  },
  notesContent: {
    paddingHorizontal: 2,
  },
  description: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'left',
    lineHeight: 22,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  progressText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  progressBarBackground: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 4,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#FFD700',
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
