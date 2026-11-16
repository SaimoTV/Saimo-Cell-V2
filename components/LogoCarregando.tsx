import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, StyleSheet, View } from 'react-native';

/**
 * Logo que serve de carregamento: aparece apagada e vai ganhando cor da
 * esquerda para a direita enquanto o vídeo abre. Sem medida real de progresso
 * (o player só diz "carregando" e "tocando"), ela avança sozinha e desacelera
 * perto do fim, para nunca chegar nos 100% antes de o vídeo começar; quando o
 * pai tira o componente (o vídeo iniciou), a imagem já está quase toda colorida.
 */
export default function LogoCarregando({ source, tamanho = 120 }: { source: ImageSourcePropType; tamanho?: number }) {
  const progresso = useRef(new Animated.Value(0)).current;
  const [largura, setLargura] = useState(tamanho);

  useEffect(() => {
    // Rápido no começo, lento no fim: 0 → 90% em ~12 s.
    const anim = Animated.timing(progresso, {
      toValue: 0.92,
      duration: 12000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [progresso]);

  const larguraCor = progresso.interpolate({ inputRange: [0, 1], outputRange: [0, largura] });

  return (
    <View style={{ width: tamanho, height: tamanho }} onLayout={(e) => setLargura(e.nativeEvent.layout.width)}>
      <Image source={source} style={[styles.img, { opacity: 0.22 }]} resizeMode="contain" />
      <Animated.View style={[styles.cor, { width: larguraCor }]}>
        <Image source={source} style={{ width: tamanho, height: tamanho }} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  img: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
  cor: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
});
